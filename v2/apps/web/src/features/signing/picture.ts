// Signature pictures that are not drawn: a typed name written in a handwriting font, and an
// uploaded photo made into a PNG — both exactly as today's page makes them (signpage/app.js).
import { TEXT } from "./rules.js";

export function typedNameToPng(name: string): string {
  const c = document.createElement("canvas");
  c.width = 600; c.height = 160;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#111";
  ctx.font = "48px 'Segoe Script', 'Comic Sans MS', cursive";
  ctx.textBaseline = "middle";
  ctx.fillText(name, 20, 80);
  return c.toDataURL("image/png");
}

/** an image file → PNG data URL, at most 800 px wide (phone photos stay well under the server's limit) */
export function fileToSignaturePng(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(TEXT.unreadable));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(TEXT.imageFailed));
      img.onload = () => {
        const scale = img.width > 800 ? 800 / img.width : 1;
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        if (!ctx) return reject(new Error(TEXT.imageFailed));
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
