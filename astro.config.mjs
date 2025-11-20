// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";

// https://astro.build/config
export default defineConfig({
  site: "https://kyoto-tech.github.io",
  integrations: [react(), sitemap(), mdx()],

  vite: {
    plugins: [tailwindcss()]
  }
});
