import { describe, expect, it } from "vitest";
import { ui } from "../src/i18n/ui.ts";
import {
  getLocalizedHomePath,
  getLocalizedSectionPath,
} from "../src/i18n/navigation.ts";

describe("localized navigation", () => {
  it("keeps the English and Japanese translation tables aligned", () => {
    expect(Object.keys(ui.ja).sort()).toEqual(Object.keys(ui.en).sort());
  });

  it("returns explicit locale home paths", () => {
    expect(getLocalizedHomePath("en")).toBe("/");
    expect(getLocalizedHomePath("ja")).toBe("/ja/");
  });

  it("builds localized section links", () => {
    expect(getLocalizedSectionPath("en", "calendar")).toBe("/#calendar");
    expect(getLocalizedSectionPath("ja", "locations")).toBe(
      "/ja/#locations",
    );
    expect(getLocalizedSectionPath("ja", "community-hub")).toBe(
      "/ja/#community-hub",
    );
  });
});
