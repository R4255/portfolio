import { defineConfig } from 'astro/config';

// Set `site` to the final domain once it's known (used for canonical + Open Graph URLs).
export default defineConfig({
  site: 'https://rohitgupta.dev',
  // The dev-only toolbar overlaps the page bottom; it never ships to production either way.
  devToolbar: { enabled: false },
});
