import { handleMarkdownRequest } from "../_lib/markdown.js";

export function onRequestGet(context) {
  return handleMarkdownRequest(context, "/agent-home.ja.md");
}
