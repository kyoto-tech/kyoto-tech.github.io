import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT_PATH = path.join(ROOT, "public/.well-known/agent-skills/index.json");
const DEFAULT_SKILLS = [
  {
    name: "markdown-for-agents",
    description: "Maintain Kyoto Tech Meetup's localized Markdown responses for AI agents.",
    path: path.join(ROOT, "public/.well-known/agent-skills/markdown-for-agents/SKILL.md"),
    url: "https://kyototechmeetup.com/.well-known/agent-skills/markdown-for-agents/SKILL.md",
  },
  {
    name: "webmcp-maintenance",
    description: "Maintain Kyoto Tech Meetup's read-only WebMCP tools as event, community-link, or member-publication data changes.",
    path: path.join(ROOT, "public/.well-known/agent-skills/webmcp-maintenance/SKILL.md"),
    url: "https://kyototechmeetup.com/.well-known/agent-skills/webmcp-maintenance/SKILL.md",
  },
];

export function buildAgentSkillsIndex(skills, skillUrl) {
  const entries = typeof skills === "string"
    ? [{
      name: "markdown-for-agents",
      description: "Maintain Kyoto Tech Meetup's localized Markdown responses for AI agents.",
      skill: skills,
      url: skillUrl,
    }]
    : skills;
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: entries.map(({ name, description, skill, url }) => ({
      name,
      type: "skill-md",
      description,
      url,
      digest: `sha256:${crypto.createHash("sha256").update(skill).digest("hex")}`,
    })),
  };
}

export async function writeAgentSkillsIndex({ skills = DEFAULT_SKILLS, outputPath = DEFAULT_OUTPUT_PATH } = {}) {
  const loadedSkills = await Promise.all(skills.map(async (skill) => ({
    ...skill,
    skill: await fs.readFile(skill.path, "utf8"),
  })));
  const index = buildAgentSkillsIndex(loadedSkills);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) await writeAgentSkillsIndex();
