import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HTML_FILE = /(?:^|\/)index\.html$/;
const INLINE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

export function hashInlineScripts(html) {
  const hashes = new Set();

  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const [, attributes, content] = match;
    if (/\bsrc\s*=/.test(attributes) || !content) continue;
    const digest = crypto.createHash("sha256").update(content).digest("base64");
    hashes.add(`'sha256-${digest}'`);
  }

  return [...hashes].sort();
}

export function buildContentSecurityPolicy(scriptHashes) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' ${scriptHashes.join(" ")} https://www.googletagmanager.com https://static.cloudflareinsights.com`,
    "script-src-attr 'none'",
    "style-src 'self'",
    "style-src-attr 'none'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com",
    "frame-src https://www.googletagmanager.com",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function routesForHtmlFile(relativePath) {
  if (relativePath === "index.html") return ["/", "/index.html"];
  const directory = path.posix.dirname(relativePath);
  return [`/${directory}/`, `/${relativePath}`];
}

async function findHtmlFiles(directory, relative = "") {
  const entries = await fs.readdir(path.join(directory, relative), {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findHtmlFiles(directory, entryPath)));
    } else if (entry.isFile() && HTML_FILE.test(entryPath)) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

export async function writeCloudflareHeaders(outputDirectory) {
  const htmlFiles = await findHtmlFiles(outputDirectory);
  const lines = [
    "/*",
    "  Strict-Transport-Security: max-age=31536000; includeSubDomains",
    "  X-Content-Type-Options: nosniff",
    "  X-Frame-Options: DENY",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    '  Link: </sitemap-index.xml>; rel="sitemap", </.well-known/security.txt>; rel="describedby"; type="text/plain"',
  ];

  for (const htmlFile of htmlFiles) {
    const html = await fs.readFile(path.join(outputDirectory, htmlFile), "utf8");
    const policy = buildContentSecurityPolicy(hashInlineScripts(html));
    for (const route of routesForHtmlFile(htmlFile)) {
      lines.push("", route, `  Content-Security-Policy: ${policy}`);
    }
  }

  await fs.writeFile(path.join(outputDirectory, "_headers"), `${lines.join("\n")}\n`);
}

export default function securityHeaders() {
  return {
    name: "kyoto-tech-security-headers",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        await writeCloudflareHeaders(fileURLToPath(dir));
      },
    },
  };
}
