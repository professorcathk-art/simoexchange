export function buildDownloadFilename(baseName: string, format: "txt" | "doc"): string {
  const safe = baseName.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
  return `${safe || "transcript"}.${format === "doc" ? "doc" : "txt"}`;
}

export function textToDocHtml(title: string, content: string): string {
  const escaped = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5;">
<h1>${title}</h1>
<div>${escaped}</div>
</body>
</html>`;
}
