// @ts-nocheck
// GENERATED copy of src/app.js with 1 import/runtime rewrites (see v2/scripts/port-verbatim.mjs) — do not edit. Re-port: node v2/scripts/port-verbatim.mjs
// Drift guard: apps/server/test/verbatim-ports.test.ts
export default {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],

        // Allow embedding external pages in iframes on *your* site
        frameSrc: [
          "'self'",
          "blob:",
          "https://gconlineplus.de",
          "https://*.gconlineplus.de",
          "https://emczwei.bitrix24.de"
        ],

        // IMPORTANT:
        // Allow *your site* to be embedded by gconlineplus (otherwise it can’t frame you).
        // If you do NOT want your site embedded there, keep only "'self'".
        frameAncestors: [
          "'self'",
          "https://gconlineplus.de",
          "https://*.gconlineplus.de",
          "https://emczwei.bitrix24.de",
          "https://bau-formular.fly.dev",
        ],

        // Allow PDF.js from unpkg + allow the inline <script> in your srcdoc (hash-based).
        // Also add scriptSrcElem explicitly to match browser error "script-src-elem".
        scriptSrc: [
          "'self'",
          "https://unpkg.com",
          "https://emczwei.bitrix24.de",

          // your existing allowed inline hashes
          "'sha256-/N6XS1N1HWcS1jcxJkTULItDFffd/I1mw8tPD5FTS3o='",
          "'sha256-5RmoD/+nJXNc4AM8oTu6YJEmH8lgRnYL9t8PcLUZxcY='",
          "'sha256-pmi68vLyMeGurqDvTzm+MD6lhDeARWXCNqv7x536RmA='",

          // hash suggested by the browser for the srcdoc inline script
          "'sha256-bVEWo/cK6LT6bDOoke6lkc5oHnahn1AxmUQubJ3s0eA='",
        ],

        // Some browsers treat <script> tags under script-src-elem specifically.
        scriptSrcElem: [
          "'self'",
          "https://unpkg.com",
          "https://emczwei.bitrix24.de",

          "'sha256-/N6XS1N1HWcS1jcxJkTULItDFffd/I1mw8tPD5FTS3o='",
          "'sha256-5RmoD/+nJXNc4AM8oTu6YJEmH8lgRnYL9t8PcLUZxcY='",
          "'sha256-pmi68vLyMeGurqDvTzm+MD6lhDeARWXCNqv7x536RmA='",
          "'sha256-bVEWo/cK6LT6bDOoke6lkc5oHnahn1AxmUQubJ3s0eA='",
        ],

        // PDF.js may create a Worker. If you use pdf.worker.min.js from unpkg,
        // allow it here; otherwise worker creation can fail.
        workerSrc: ["'self'", "blob:", "https://unpkg.com"],

        styleSrc: ["'self'", "'unsafe-inline'"],

        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://media.onlineplus.store",
          // "https://*.onlineplus.store",
          // Keramico motif panels, shown straight from cleverbad.de's image
          // storage (Badolux's shop) — see assets/badolux/keramico-motive.json.
          "https://lojjuyeivvvykspkfaxl.supabase.co",
        ],

        fontSrc: ["'self'", "data:"],

        connectSrc: [
          "'self'",
          "https://emczwei.bitrix24.de",
          "https://route-plannung.fly.dev",
          "https://bau-formular.fly.dev",
          // if your viewer fetches PDFs or assets from unpkg via fetch/XHR:
          "https://unpkg.com",
          // sw.js caches product images from this host (IMAGE_HOSTS) by
          // re-fetching them, and a service worker's fetch() is governed by
          // connect-src, not img-src. Without it every CDN product image fails
          // with ERR_FAILED as soon as the offline shell is registered.
          "https://media.onlineplus.store",
          // Same reason for the Keramico motif images (img-src above).
          "https://lojjuyeivvvykspkfaxl.supabase.co",
        ],

        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  };
