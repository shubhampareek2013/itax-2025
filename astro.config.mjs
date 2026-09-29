import { defineConfig } from 'astro/config';

// Static-site build. Deployed to Cloudflare Pages (free tier).
// Set `site` to your production domain once you have one — it is used
// to generate absolute canonical URLs, Open Graph tags and the sitemap.
export default defineConfig({
  site: process.env.SITE_URL || 'https://example-itax.pages.dev',
  output: 'static',
  build: {
    format: 'directory'
  }
});
