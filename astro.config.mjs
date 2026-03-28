// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  site: "https://kyototechmeetup.com",
  output: "static",
  adapter: cloudflare(),
  integrations: [react(), sitemap(), mdx()],

  i18n: {
    locales: ["en", "ja"],
    defaultLocale: "en",
  },

  vite: {
    // Cast avoids occasional CI type mismatches when Vite types are resolved from
    // different module instances, while runtime behavior is unchanged.
    plugins: [/** @type {any} */ (tailwindcss())]
  }
});
