import crypto from "node:crypto";
import { describe, expect, test } from "vitest";
import { buildAgentSkillsIndex } from "../scripts/generate-agent-skills-index.mjs";

describe("agent skills discovery index", () => {
  test("publishes a digest for the Markdown maintenance skill", () => {
    const skill = "# Markdown skill\n";
    const index = buildAgentSkillsIndex(skill, "https://example.com/SKILL.md");
    const expectedDigest = crypto.createHash("sha256").update(skill).digest("hex");

    expect(index.$schema).toBe("https://schemas.agentskills.io/discovery/0.2.0/schema.json");
    expect(index.skills).toEqual([{
      name: "markdown-for-agents",
      type: "skill-md",
      description: "Maintain Kyoto Tech Meetup's localized Markdown responses for AI agents.",
      url: "https://example.com/SKILL.md",
      digest: `sha256:${expectedDigest}`,
    }]);
  });
});
