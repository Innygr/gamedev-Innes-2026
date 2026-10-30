/**
 * Shared GameDev class checklist API.
 *
 * Cloudflare Worker bindings:
 *   GH_TOKEN  (Secret): GitHub fine-grained token with Contents: Read and write
 *   GH_OWNER  (Text): Innygr
 *   GH_REPO   (Text): gamedev-Innes-2026
 *   GH_BRANCH (Text): main
 *
 * GET  /checklist  -> { items: [{ id, text, checked }] }
 * POST /checklist  -> accepts { baseItems, items }; deletions are synchronized.
 *
 * The repository file keeps its existing "completed" property for compatibility.
 * The website uses "checked"; this Worker converts between the two formats.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length > 500) {
    throw new Error("Invalid checklist: expected an array of up to 500 items.");
  }

  return items
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: String(item.id || crypto.randomUUID()).slice(0, 80),
      text: String(item.text || "").trim().slice(0, 240),
      checked: Boolean(item.checked ?? item.completed),
    }))
    .filter((item) => item.text.length > 0);
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
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0)
  );

  return new TextDecoder().decode(bytes);
}

async function githubRequest(env, method, body) {
  const url =
    `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/checklist.json`;

  const headers = {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "GameDev-Class-Checklist",
  };

  const options = { method, headers };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = result.message || response.statusText || "Unknown GitHub error";
    throw new Error(`GitHub API ${method} failed (${response.status}): ${message}`);
  }

  return result;
}

async function readChecklist(env) {
  const file = await githubRequest(env, "GET");
  if (!file.content) {
    throw new Error("GitHub returned an empty checklist.json file.");
  }

  const stored = JSON.parse(base64ToUtf8(file.content));
  const items = normalizeItems(Array.isArray(stored) ? stored : stored.items || []);

  return {
    sha: file.sha,
    items,
    updatedAt: stored.updatedAt || null,
  };
}

/**
 * Three-way merge:
 * - Changes made in this browser are compared with its last synced snapshot.
 * - Items removed from this browser since that snapshot are deleted remotely.
 * - Unchanged items from other browsers are preserved.
 * - New items from either browser are retained.
 */
function mergeItems(latestItems, baseItems, incomingItems) {
  const result = new Map(latestItems.map((item) => [item.id, item]));
  const base = new Map(baseItems.map((item) => [item.id, item]));
  const incoming = new Map(incomingItems.map((item) => [item.id, item]));

  for (const [id, oldItem] of base) {
    const newItem = incoming.get(id);

    if (!newItem) {
      // It existed in the last synced snapshot but was removed locally.
      result.delete(id);
    } else if (
      newItem.text !== oldItem.text ||
      newItem.checked !== oldItem.checked
    ) {
      // The local browser changed this item.
      result.set(id, newItem);
    }
  }

  for (const [id, item] of incoming) {
    if (!base.has(id)) {
      // Newly added locally.
      result.set(id, item);
    }
  }

  return [...result.values()];
}

async function saveChecklist(env, baseItems, incomingItems) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const latest = await readChecklist(env);
    const merged = mergeItems(latest.items, baseItems, incomingItems);
    const updatedAt = new Date().toISOString();

    // Preserve the existing repository schema ("completed") while the API
    // consistently returns the website schema ("checked").
    const storedData = {
      version: 1,
      updatedAt,
      items: merged.map((item) => ({
        id: item.id,
        text: item.text,
        completed: item.checked,
      })),
    };

    try {
      await githubRequest(env, "PUT", {
        message: "Update shared class checklist",
        content: utf8ToBase64(JSON.stringify(storedData, null, 2) + "\n"),
        sha: latest.sha,
        branch: env.GH_BRANCH || "main",
      });

      return { items: merged, updatedAt };
    } catch (error) {
      // A concurrent update can invalidate the file SHA. Re-read and merge.
      if (!String(error.message).includes("(409)") || attempt === 3) {
        throw error;
      }
    }
  }

  throw new Error("The checklist changed repeatedly. Please try again.");
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/") {
      return json({
        status: "Worker is running!",
        service: "Gamedev Class Checklist",
      });
    }

    if (url.pathname !== "/checklist") {
      return json({ error: "Not found" }, 404);
    }

    if (!env.GH_TOKEN || !env.GH_OWNER || !env.GH_REPO) {
      return json(
        { error: "Worker configuration is incomplete. Check GH_OWNER, GH_REPO, and GH_TOKEN." },
        503
      );
    }

    try {
      if (request.method === "GET") {
        const checklist = await readChecklist(env);

        return json({
          items: checklist.items,
          updatedAt: checklist.updatedAt,
        });
      }

      if (request.method === "POST") {
        const body = await request.json();
        const baseItems = normalizeItems(body.baseItems || []);
        const incomingItems = normalizeItems(body.items || []);

        const result = await saveChecklist(env, baseItems, incomingItems);
        return json(result);
      }

      return json({ error: "Method not allowed" }, 405);
    } catch (error) {
      console.error("Checklist Worker error:", error);

      return json(
        { error: error.message || "An unexpected error occurred." },
        500
      );
    }
  },
};
