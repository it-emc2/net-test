// src/external/magicApi.js
import axios from "axios";

const baseURL = process.env.EXTERNAL_API_BASE;

if (!baseURL) {
  console.error("Missing EXTERNAL_API_BASE in .env");
}

let cachedToken = null;
let tokenExpiresAt = 0;

// Login und Token holen
async function login() {
  const res = await axios.post(
    `${baseURL}/api/auth/login`,
    {
      // Body wie in Postman – ggf. anpassen
      email: process.env.EXTERNAL_API_USER,
      password: process.env.EXTERNAL_API_PASSWORD,
    },
    { timeout: 10_000 },
  );

  const { token } = res.data;
  // Optional: Ablaufzeit aus JWT lesen, hier einfach 50 Min gültig annehmen
  tokenExpiresAt = Date.now() + 50 * 60 * 1000;
  cachedToken = token;
  return token;
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60 * 1000) {
    return cachedToken;
  }
  return login();
}

// generische Helper-Funktion, um externe Endpunkte aufzurufen
export async function callExternal(method, path, { params, data } = {}) {
  const token = await getToken();

  const res = await axios.request({
    method,
    url: `${baseURL}${path}`,
    params,
    data,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    timeout: 15_000,
  });

  return res.data;
}
