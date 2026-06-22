# Arbeitsbericht API Example

Use this endpoint from the other app to generate the Arbeitsbericht PDF on demand:

```text
POST /api/arbeitsbericht/pdf
```

## Browser fetch example

```js
async function downloadArbeitsberichtPdf(payload) {
  const response = await fetch("https://YOUR-BACKEND-DOMAIN/api/arbeitsbericht/pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    credentials: "include",
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.error || `Arbeitsbericht PDF generation failed: ${response.status}`,
    );
  }

  const contentDisposition =
    response.headers.get("content-disposition") || "";
  const filenameMatch = contentDisposition.match(/filename="?(.*?)"?$/i);
  const filename = filenameMatch?.[1] || "Arbeitsbericht.pdf";

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}
```

## Using the local ApiService helper

```js
import { apiService } from "../src/services/ApiService.js";

const { blob, filename } = await apiService.downloadArbeitsberichtPdf(payload);

const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = filename;
document.body.appendChild(link);
link.click();
link.remove();
URL.revokeObjectURL(url);
```
