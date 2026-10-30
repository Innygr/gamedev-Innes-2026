# Shared class checklist

The checklist is shared by everyone visiting the GameDev class site. The canonical data is stored in the repository's `checklist.json`; a Cloudflare Worker provides safe read/write access.

## Deploy the API

1. Create a Cloudflare Worker named `gamedev-class-checklist`.
2. Deploy the code in `cloudflare-worker/src/index.js` (or deploy this folder with Wrangler).
3. Set Worker variables:
   - `GH_OWNER=Innygr`
   - `GH_REPO=gamedev-Innes-2026`
   - `GH_BRANCH=main`
4. Create a GitHub fine-grained personal access token restricted to this repository, with **Contents: Read and write** permission. Store it in Cloudflare as the Worker secret `GH_TOKEN`. Never put this token in the website or commit it.
5. Copy the deployed Worker URL ending in `/checklist` into `CHECKLIST_API_URL` in `index.html`.

## API

- `GET /checklist` returns the shared checklist.
- `POST /checklist` accepts `{ "baseItems": [...], "items": [...] }`. The Worker merges only the changes made since the browser's last synced snapshot, so unrelated concurrent edits are preserved, then commits the result to `checklist.json`.

The site keeps a local cache for offline resilience. While the Worker URL is not configured or the Worker is unavailable, changes remain local and the page displays that sync is offline/not configured.

## Important

This is a public shared board: anyone who can access the site can read and edit it. Do not put private information in checklist entries. The Worker token is server-side, but the public API intentionally allows public checklist edits.
