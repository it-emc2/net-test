/* eslint-disable no-undef */
// next.config.js
const CSP = [
  "default-src 'self'",
  "frame-src 'self' https://gconlineplus.de https://*.gconlineplus.de",
].join("; ");

module.exports = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};
