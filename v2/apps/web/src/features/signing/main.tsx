// Entry of the public signing page (sign.html). Light or dark follows the device; nothing else of
// the app is loaded (no login, no router, no offer store, no service worker).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SignPage } from "./SignPage.js";
import "../../styles.css";

const dark = (() => { try { return window.matchMedia("(prefers-color-scheme: dark)"); } catch { return null; } })();
const paint = () => { document.documentElement.dataset.mode = dark?.matches ? "dark" : "light"; };
paint();
dark?.addEventListener?.("change", paint);

createRoot(document.getElementById("root")!).render(<StrictMode><SignPage /></StrictMode>);
