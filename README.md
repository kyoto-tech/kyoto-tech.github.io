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

1. Fork or clone the repo, then branch from `main`.
2. Make your changes and commit on your branch.
3. Before submitting a pull request:
    1. Ensure your local branch is up to date with `main`.
    2. Run `npm run check` to ensure lint, type, and Astro diagnostics all pass.
4. Push your branch to the remote repository.
5. Open a pull request, describing what you changed.
6. Request a review.

## Ideas for Contributions

- Expand homepage content (additional recurring events, partner highlights, FAQs).
- Build an email newsletter signup form.
- Improve accessibility (ARIA labeling, color contrast, keyboard navigation checks).
- Add tests or visual regression tooling for future redesigns.
- Internationalization or localization improvements for Japanese/English visitors.

## Deployment

- The site is deployed automatically to [GitHub Pages](https://kyoto-tech.github.io) via the workflow in `.github/workflows/deploy.yml`.
- Any push to `main` triggers `npm ci`, `npm run build`, and then publishes the `dist/` directory using `actions/deploy-pages`.
- To test a production build locally, use `npm run build && npm run preview`.

## Interacting with the community

- **Want to report a bug or suggest a feature?**
  - [Open an issue on GitHub](https://github.com/kyoto-tech/site/issues).
- **Need help getting started?**
  - [Join the Kyoto Tech Meetup Discord](https://discord.gg/mXFWEHDKeu).

---

Thanks for helping keep Kyoto’s tech community visible!
