import fs from "node:fs";
import path from "node:path";
import { getPageItems, loadArticleBySlug } from "../src/lib/content.mjs";

const OUT_DIR = path.join(process.cwd(), "dist");

const pages = [
  ["Income-tax Act, 2025 — all sections", "/income-tax-act-2025", "Browse every section"],
  ["Income-tax Rules, 2026", "/income-tax-rules-2026", "Rules linked to sections"],
  ["1961 Act → 2025 Act mapping", "/1961-vs-2025", "Verified old-to-new mapping"],
  ["Case law", "/case-law", "Verified judgments"],
  ["CBDT circulars", "/cbdt-circulars", "Official guidance"],
  ["CBDT notifications", "/cbdt-notifications", "Official guidance"],
  ["Amendments — what has changed in the Act", "/amendments", "Daily-checked changes with commentary"],
  ["Tax calculators", "/tax-calculators", "Deterministic calculators"],
  ["Latest updates", "/latest-updates", "Newly published provisions"],
  ["About this site", "/about", "How the site works"],
  ["Disclaimer", "/disclaimer", "Legal notice"]
];

function main() {
  const index = getPageItems().map((item) => {
    const a = loadArticleBySlug(item.slug);
    return {
      kind: "Section",
      section: item.section,
      title: item.title,
      description: a?.frontmatter?.description || `${item.chapter}`,
      url: `/income-tax-act-2025/section/${item.slug}`,
      tags: a?.frontmatter?.tags || []
    };
  });
  for (const [title, url, description] of pages) index.push({ kind: "Page", title, url, description, tags: [] });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "search-index.json"), JSON.stringify(index), "utf-8");
  console.log(`search-index.json written with ${index.length} entries.`);
}
main();
