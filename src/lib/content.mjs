import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ROOT = process.cwd();
const SECTIONS_JSON = path.join(ROOT, "content", "sections.json");
const ARTICLES_DIR = path.join(ROOT, "content", "articles");

export function loadQueue() {
  const raw = fs.readFileSync(SECTIONS_JSON, "utf-8");
  return JSON.parse(raw);
}

export function getPublishedItems() {
  return loadQueue().items.filter((i) => i.status === "published");
}

export function getNextPendingItem() {
  return loadQueue().items.find((i) => i.status === "pending") || null;
}

export function loadArticleBySlug(slug) {
  const file = path.join(ARTICLES_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf-8");
  const { data, content } = matter(raw);
  return { frontmatter: data, body: content };
}

export function getAllArticleSlugs() {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  return fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

// ---- official text, amendments, status ----
export function sourcePath(id) { return path.join(ROOT, "content", "source", `${id}.txt`); }
export function hasSource(id) { return fs.existsSync(sourcePath(id)); }
export function loadSource(id) { return hasSource(id) ? fs.readFileSync(sourcePath(id), "utf-8") : ""; }
// every section that has a page: it has official text, or it is a published explanation
export function getPageItems() { return loadQueue().items.filter((i) => hasSource(i.id) || i.status === "published"); }
export function loadAmendments() {
  const dir = path.join(ROOT, "content", "amendments");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")))
    .sort((a, b) => (b.date_detected + b.id).localeCompare(a.date_detected + a.id));
}
export function loadStatus() {
  const f = path.join(ROOT, "content", "status.json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf-8")) : null;
}

// ---- study guides (commentary, example, MCQs, mnemonics) ----
export function loadStudy(id) {
  const f = path.join(ROOT, "content", "study", `${id}.json`);
  if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f, "utf-8"));
  return d.status === "ok" ? d : null;
}
