import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [skill, indexText, homepage, englishMarkdown, japaneseMarkdown] = await Promise.all([
  read("public/.well-known/agent-skills/webmcp-maintenance/SKILL.md"),
  read("dist/.well-known/agent-skills/index.json"),
  read("dist/index.html"),
  read("public/agent-home.en.md"),
  read("public/agent-home.ja.md"),
]);

const index = JSON.parse(indexText);
const webmcpSkill = index.skills.find(({ name }) => name === "webmcp-maintenance");
const expectedDigest = crypto.createHash("sha256").update(skill).digest("hex");

assert(webmcpSkill, "Agent Skills index is missing webmcp-maintenance.");
assert(webmcpSkill.digest === `sha256:${expectedDigest}`, "WebMCP skill digest is stale.");
assert(homepage.includes("webmcp-data"), "Homepage is missing the WebMCP data snapshot.");
assert(homepage.includes("WebMcpProvider"), "Homepage is missing the WebMCP provider bundle.");
assert(englishMarkdown.includes("Kyoto Tech Meetup"), "English agent Markdown was not generated.");
assert(japaneseMarkdown.includes("Kyoto Tech Meetup"), "Japanese agent Markdown was not generated.");

console.log("[agent-readiness] Markdown, Agent Skills, and WebMCP artifacts verified.");
