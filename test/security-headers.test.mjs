import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildContentSecurityPolicy,
  hashInlineScripts,
  writeCloudflareHeaders,
} from "../scripts/security-headers.mjs";

describe("Cloudflare security headers", () => {
  test("hashes inline scripts without weakening script-src", () => {
    const script = "window.dataLayer = window.dataLayer || [];";
    const expected = crypto.createHash("sha256").update(script).digest("base64");
    const hashes = hashInlineScripts(
      `<script>${script}</script><script src="/app.js"></script>`,
    );
    const policy = buildContentSecurityPolicy(hashes);

    expect(hashes).toEqual([`'sha256-${expected}'`]);
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  test("writes route-specific CSP plus global browser protections", async () => {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), "headers-test-"));
    await fs.mkdir(path.join(output, "ja"));
    await fs.writeFile(path.join(output, "index.html"), "<script>one()</script>");
    await fs.writeFile(
      path.join(output, "ja", "index.html"),
      "<script>two()</script>",
    );

    await writeCloudflareHeaders(output);
    const headers = await fs.readFile(path.join(output, "_headers"), "utf8");

    expect(headers).toContain("Strict-Transport-Security");
    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain("Permissions-Policy:");
    expect(headers).toContain("\n/\n  Content-Security-Policy:");
    expect(headers).toContain("\n/ja/\n  Content-Security-Policy:");
  });
});
