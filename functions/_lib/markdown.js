/* global URL, Request, Headers, Response */

export function acceptsMarkdown(header) {
  return String(header ?? "").split(",").some((part) => {
    const [mediaType, ...parameters] = part.trim().toLowerCase().split(";");
    if (mediaType !== "text/markdown" && mediaType !== "text/*") return false;
    const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
    return !quality || Number(quality.trim().slice(2)) > 0;
  });
}

export async function serveMarkdown(context, assetPath) {
  const assetUrl = new URL(assetPath, context.request.url);
  const assetResponse = await context.env.ASSETS.fetch(new Request(assetUrl, context.request));
  if (!assetResponse.ok) return assetResponse;
  const headers = new Headers(assetResponse.headers);
  headers.set("Content-Type", "text/markdown; charset=utf-8");
  headers.set("Vary", "Accept");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return new Response(assetResponse.body, { status: 200, headers });
}

export function handleMarkdownRequest(context, assetPath) {
  return acceptsMarkdown(context.request.headers.get("Accept"))
    ? serveMarkdown(context, assetPath)
    : context.env.ASSETS.fetch(context.request);
}
