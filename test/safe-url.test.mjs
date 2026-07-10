import { expect, test } from "vitest";
import { getSafeWebUrl } from "../src/lib/safe-url.ts";

test("getSafeWebUrl accepts web links and rejects active URL schemes", () => {
  expect(getSafeWebUrl("https://example.com/post")).toBe(
    "https://example.com/post",
  );
  expect(getSafeWebUrl("http://localhost:4321/")).toBe(
    "http://localhost:4321/",
  );
  expect(getSafeWebUrl("javascript:alert(1)")).toBeNull();
  expect(getSafeWebUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
});
