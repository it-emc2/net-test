// TEST-ONLY preload for the spawned legacy app (node --import). Legacy email.js hard-codes SMTP
// port 587; this redirects nodemailer transports to the local SMTP sink's random port given in
// OC_TEST_SMTP_PORT. Nothing else is changed. Never used outside the contract test.
import { createRequire } from "node:module";
const port = Number(process.env.OC_TEST_SMTP_PORT);
if (port) {
  const nodemailer = createRequire(process.cwd() + "/package.json")("nodemailer");
  const orig = nodemailer.createTransport.bind(nodemailer);
  nodemailer.createTransport = (opts, defaults) =>
    orig(opts && typeof opts === "object" && opts.host === "127.0.0.1" ? { ...opts, port } : opts, defaults);
}
