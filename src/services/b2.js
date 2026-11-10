// Backblaze B2 (native API, plain fetch — no SDK) for session recordings.
// Env: B2_KEY_ID, B2_APP_KEY — an application key restricted to ONE bucket;
// the bucket comes from the key's own authorization (no extra config).
import crypto from "node:crypto";

let auth = null; // { token, apiUrl, downloadUrl, bucketId, bucketName, at }
let upload = null; // { url, token }

export const b2Configured = () => !!(process.env.B2_KEY_ID && process.env.B2_APP_KEY);

async function authorize(force = false) {
  // Tokens live 24 h; re-authorize after 20 h or when a call says 401.
  if (auth && !force && Date.now() - auth.at < 20 * 3600e3) return auth;
  const basic = Buffer.from(`${process.env.B2_KEY_ID}:${process.env.B2_APP_KEY}`).toString("base64");
  const r = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
    headers: { Authorization: `Basic ${basic}` },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`b2 authorize ${r.status} ${j.code || ""}`);
  const s = j.apiInfo.storageApi;
  if (!s.bucketId) throw new Error("b2 key must be restricted to one bucket");
  auth = { token: j.authorizationToken, apiUrl: s.apiUrl, downloadUrl: s.downloadUrl, bucketId: s.bucketId, bucketName: s.bucketName, at: Date.now() };
  upload = null;
  return auth;
}

async function uploadUrl(force = false) {
  if (upload && !force) return upload;
  const a = await authorize();
  const r = await fetch(`${a.apiUrl}/b2api/v3/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: a.token },
    body: JSON.stringify({ bucketId: a.bucketId }),
  });
  const j = await r.json();
  if (r.status === 401) { await authorize(true); return uploadUrl(true); }
  if (!r.ok) throw new Error(`b2 get_upload_url ${r.status} ${j.code || ""}`);
  upload = { url: j.uploadUrl, token: j.authorizationToken };
  return upload;
}

export async function b2Put(name, buf, contentType = "application/gzip") {
  const sha1 = crypto.createHash("sha1").update(buf).digest("hex");
  // An upload URL can go stale (401) or busy (503): fetch a fresh one and retry once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const u = await uploadUrl(attempt > 0);
    const r = await fetch(u.url, {
      method: "POST",
      headers: {
        Authorization: u.token,
        "X-Bz-File-Name": encodeURIComponent(name),
        "Content-Type": contentType,
        "Content-Length": String(buf.length),
        "X-Bz-Content-Sha1": sha1,
      },
      body: buf,
    });
    if (r.ok) return (await r.json()).fileId;
    if (attempt === 1 || ![401, 408, 500, 503].includes(r.status)) {
      const j = await r.json().catch(() => ({}));
      throw new Error(`b2 upload ${r.status} ${j.code || ""}`);
    }
  }
}

export async function b2Get(name) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await authorize(attempt > 0);
    const r = await fetch(`${a.downloadUrl}/file/${a.bucketName}/${encodeURIComponent(name).replace(/%2F/g, "/")}`, {
      headers: { Authorization: a.token },
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status !== 401 || attempt === 1) throw new Error(`b2 download ${r.status}`);
  }
}
