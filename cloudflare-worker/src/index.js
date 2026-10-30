/**
 * Shared GameDev class checklist API.
 *
 * Deploy with Cloudflare Workers. Configure:
 *   secret GH_TOKEN = GitHub fine-grained token with Contents: Read and write
 *   vars GH_OWNER = Innygr
 *   vars GH_REPO = gamedev-Innes-2026
 *   vars GH_BRANCH = main
 *
 * The worker exposes GET /checklist and POST /checklist.
 * GitHub credentials stay in Worker secrets, never in browser code.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}
function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
function base64ToUtf8(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function cleanItems(items) {
  if (!Array.isArray(items) || items.length > 500) throw new Error("Invalid checklist.");
  return items.map(item => {
    if (!item || typeof item.text !== "string" || typeof item.checked !== "boolean") {
      throw new Error("Invalid checklist item.");
    }
    return {
      id: String(item.id || crypto.randomUUID()).slice(0, 80),
      text: item.text.trim().slice(0, 240),
      checked: item.checked
    };
  }).filter(item => item.text);
}
async function githubRequest(env, method, body) {
  const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/checklist.json`;
  return fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${env.GH_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "GameDev-Class-Checklist"
    },
    body: body ? JSON.stringify(body) : undefined
  });
}
async function readChecklist(env) {
  const res = await githubRequest(env, "GET");
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}).`);
  const file = await res.json();
  const data = JSON.parse(base64ToUtf8(file.content));
  return { sha: file.sha, data };
}
function mergeItems(latest, base, incoming) {
  const result = new Map(latest.map(item => [item.id, item]));
  const baseMap = new Map(base.map(item => [item.id, item]));
  const incomingMap = new Map(incoming.map(item => [item.id, item]));

  // Apply only changes made relative to this browser's last synced snapshot.
  for (const [id, oldItem] of baseMap) {
    const newItem = incomingMap.get(id);
    if (!newItem) {
      result.delete(id);
    } else if (JSON.stringify(newItem) !== JSON.stringify(oldItem)) {
      result.set(id, newItem);
    }
  }
  for (const [id, item] of incomingMap) {
    if (!baseMap.has(id)) result.set(id, item);
  }
  return [...result.values()];
}
async function saveChecklist(env, baseItems, incomingItems) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { sha, data } = await readChecklist(env);
    const merged = mergeItems(cleanItems(data.items), baseItems, incomingItems);
    const next = { version: 1, updatedAt: new Date().toISOString(), items: merged };
    const put = await githubRequest(env, "PUT", {
      message: "Update shared class checklist",
      content: utf8ToBase64(JSON.stringify(next, null, 2) + "\n"),
      sha,
      branch: env.GH_BRANCH || "main"
    });
    if (put.ok) return next;
    if (put.status !== 409 && put.status !== 422) {
      throw new Error(`GitHub write failed (${put.status}).`);
    }
  }
  throw new Error("Checklist changed repeatedly. Please try again.");
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);
    if (url.pathname !== "/checklist") return response({ error: "Not found" }, 404);
    if (!env.GH_TOKEN || !env.GH_OWNER || !env.GH_REPO) {
      return response({ error: "Checklist API is not configured." }, 503);
    }
    try {
      if (request.method === "GET") {
        const { data } = await readChecklist(env);
        return response(data);
      }
      if (request.method === "POST") {
        const body = await request.json();
        const base = cleanItems(body.baseItems || []);
        const incoming = cleanItems(body.items || []);
        return response(await saveChecklist(env, base, incoming));
      }
      return response({ error: "Method not allowed" }, 405);
    } catch (error) {
      return response({ error: error.message || "Unexpected error" }, 500);
    }
  }
};
