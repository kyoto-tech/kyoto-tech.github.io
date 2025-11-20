# Kyoto Tech Meetup Website

This repository holds the Astro-powered marketing site for the Kyoto Tech Meetup community. 

Everything here is maintained by community members; contributions that make the experience clearer, more accessible, or easier to maintain are welcome.

## Tech Stack

- [Astro 5](https://astro.build/) with React islands for dynamic UI.
- [Tailwind CSS 4 (via `@tailwindcss/vite`)](https://tailwindcss.com/) for utility-first styling plus a small layer of global CSS.
- [Marked](https://marked.js.org/) for rendering Markdown copy inside Astro components.
- ESLint (flat config), TypeScript, Knip, and Astro Check keep the project tidy.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the local dev server:

   ```bash
   npm run dev
   ```

   Visit `http://localhost:4321` to view the site. Astro enables hot module replacement, so edits appear immediately.

3. Build for production:

   ```bash
   npm run build
   npm run preview
   ```

## Useful Scripts

| Command            | Purpose                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `npm run dev`      | Launches Astro in development mode.                                     |
| `npm run check`    | Runs lint, type-check, Astro check, and Knip in sequence.               |
| `npm run preview`  | Serves the production build locally.                                    |
| `npm run build`    | Produces the static site in `dist/`.                                    |


## Project Structure

```
src/
├─ pages/        # Astro pages (currently the main landing page)
├─ layouts/      # Shared shells and metadata
├─ components/   # Reusable sections (WhyJoin, WhatWeDo, etc.)
├─ styles/       # Global CSS entry point and Tailwind import
└─ assets/       # Static assets bundled by Astro
public/          # Files served as-is (favicon, images)
```

## Contributing

1. Fork or clone the repo and create a feature branch.
2. Make your changes with clear, accessible copy. Favor data-driven component props when adding new sections.
3. Run `npm run check` before opening a pull request to ensure lint, type, and Astro diagnostics all pass.
4. Describe what you changed and, if applicable, attach screenshots of UI updates for quicker reviews.

## Ideas for Contributions

- Expand homepage content (additional recurring events, partner highlights, FAQs).
- Build an email newsletter signup form.
- Improve accessibility (ARIA labeling, color contrast, keyboard navigation checks).
- Add tests or visual regression tooling for future redesigns.
- Internationalization or localization improvements for Japanese/English visitors.

## Interacting with the community

- **Want to report a bug or suggest a feature?**
  - [Open an issue on GitHub](https://github.com/kyoto-tech/site/issues).
- **Need help getting started?**
  - [Join the Kyoto Tech Meetup Discord](https://discord.gg/mXFWEHDKeu).

---

Thanks for helping keep Kyoto’s tech community visible!
