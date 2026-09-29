import fs from "node:fs";
import path from "node:path";
import { getPageItems, getPublishedItems } from "../src/lib/content.mjs";

const SITE = process.env.SITE_URL || "https://example-itax.pages.dev";
const OUT_DIR = path.join(process.cwd(), "dist");

const staticPaths = [
  "/", "/income-tax-act-2025", "/amendments", "/income-tax-rules-2026", "/1961-vs-2025", "/case-law",
  "/cbdt-circulars", "/cbdt-notifications", "/tax-concepts", "/tax-calculators",
  "/latest-updates", "/search", "/about", "/disclaimer", "/privacy-policy", "/contact"
];

function main() {
  const items = getPageItems();
  const published = getPublishedItems();
  const urls = [
    ...staticPaths,
    ...items.map((i) => `/income-tax-act-2025/section/${i.slug}`)
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join("\n") +
    `\n</urlset>\n`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "sitemap.xml"), xml, "utf-8");

  const robots = `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`;
  fs.writeFileSync(path.join(OUT_DIR, "robots.txt"), robots, "utf-8");

  const rss = buildRss(published);
  fs.writeFileSync(path.join(OUT_DIR, "rss.xml"), rss, "utf-8");

  console.log(`sitemap.xml, robots.txt, rss.xml written with ${urls.length} URLs.`);
}

function buildRss(items) {
  const sorted = [...items].sort((a, b) => (b.published_date || "").localeCompare(a.published_date || ""));
  const entries = sorted
    .map(
      (i) => `  <item>
    <title>Section ${i.section} — ${escapeXml(i.title)}</title>
    <link>${SITE}/income-tax-act-2025/section/${i.slug}</link>
    <guid>${SITE}/income-tax-act-2025/section/${i.slug}</guid>
    <pubDate>${new Date(i.published_date || Date.now()).toUTCString()}</pubDate>
  </item>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n  <title>Income-tax Act, 2025 — Latest Updates</title>\n  <link>${SITE}</link>\n  <description>Newly published provisions of the Income-tax Act, 2025</description>\n${entries}\n</channel></rss>\n`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

main();
