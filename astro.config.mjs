import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwind from '@astrojs/tailwind';

// Static deploy targets (GitHub Pages):
//   - User page repo (`vincentbligny-eng.github.io`): SITE=https://vincentbligny-eng.github.io  BASE=/
//   - Project page repo (`cdrs`):                     SITE=https://vincentbligny-eng.github.io  BASE=/cdrs/
// Both env vars are set by the deploy workflow. Local `astro dev` falls back to root.
const SITE = process.env.SITE || undefined;
const BASE = process.env.BASE || '/';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  integrations: [
    svelte(),
    tailwind({ applyBaseStyles: false }),
  ],
  devToolbar: { enabled: false },
});
