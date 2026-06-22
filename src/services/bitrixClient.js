// ESM version
const BITRIX_BASE = process.env.BITRIX_BASE; // same one used by existing integration

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function bitrixCall(method, payload = {}, { retries = 5, retryDelayMs = 1200 } = {}) {
  if (!BITRIX_BASE) {
    throw new Error("Missing BITRIX_BASE env");
  }

  const url = `${BITRIX_BASE}/${method}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response from ${method}: ${text.slice(0, 500)}`);
      }

      if (!res.ok || data.error) {
        const code = data.error || `HTTP_${res.status}`;
        const msg = data.error_description || text || res.statusText;
        const retryable =
          code === "QUERY_LIMIT_EXCEEDED" ||
          code === "OVERLOAD_LIMIT" ||
          res.status === 429 ||
          res.status === 503;

        if (retryable && attempt < retries) {
          await sleep(retryDelayMs * attempt);
          continue;
        }

        throw new Error(`${method} failed (${code}): ${msg}`);
      }

      return data;
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(retryDelayMs * attempt);
    }
  }
}