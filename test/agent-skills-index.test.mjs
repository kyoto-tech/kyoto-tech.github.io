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

  test("supports multiple maintained skills", () => {
    const index = buildAgentSkillsIndex([
      {
        name: "markdown-for-agents",
        description: "Markdown",
        skill: "markdown",
        url: "https://example.com/markdown/SKILL.md",
      },
      {
        name: "webmcp-maintenance",
        description: "WebMCP",
        skill: "webmcp",
        url: "https://example.com/webmcp/SKILL.md",
      },
    ]);

    expect(index.skills).toHaveLength(2);
    expect(index.skills[1]).toMatchObject({
      name: "webmcp-maintenance",
      type: "skill-md",
      description: "WebMCP",
      url: "https://example.com/webmcp/SKILL.md",
      digest: `sha256:${crypto.createHash("sha256").update("webmcp").digest("hex")}`,
    });
  });
});
