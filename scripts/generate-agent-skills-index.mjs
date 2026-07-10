import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_PATH = path.join(ROOT, "public/.well-known/agent-skills/markdown-for-agents/SKILL.md");
const DEFAULT_OUTPUT_PATH = path.join(ROOT, "public/.well-known/agent-skills/index.json");
const DEFAULT_SKILL_URL = "https://kyototechmeetup.com/.well-known/agent-skills/markdown-for-agents/SKILL.md";

export function buildAgentSkillsIndex(skill, skillUrl = DEFAULT_SKILL_URL) {
  const digest = crypto.createHash("sha256").update(skill).digest("hex");
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [{
      name: "markdown-for-agents",
      type: "skill-md",
      description: "Maintain Kyoto Tech Meetup's localized Markdown responses for AI agents.",
      url: skillUrl,
      digest: `sha256:${digest}`,
    }],
  };
}

export async function writeAgentSkillsIndex({ skillPath = SKILL_PATH, outputPath = DEFAULT_OUTPUT_PATH, skillUrl = DEFAULT_SKILL_URL } = {}) {
  const skill = await fs.readFile(skillPath, "utf8");
  const index = buildAgentSkillsIndex(skill, skillUrl);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) await writeAgentSkillsIndex();
