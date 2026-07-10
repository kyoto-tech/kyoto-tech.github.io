type SiteLanguage = "en" | "ja";

type HomeSection = "calendar" | "community-hub";

export function getLocalizedHomePath(lang: SiteLanguage): "/" | "/ja/" {
  return lang === "ja" ? "/ja/" : "/";
}

export function getLocalizedSectionPath(
  lang: SiteLanguage,
  section: HomeSection,
): string {
  return `${getLocalizedHomePath(lang)}#${section}`;
}
