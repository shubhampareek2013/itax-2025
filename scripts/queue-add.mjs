// Usage: node scripts/queue-add.mjs "5" "Scope of Total Income" "Chapter I - Preliminary" "Tax Administration"
import fs from "node:fs";
import path from "node:path";
import { loadQueue } from "../src/lib/content.mjs";

const [, , section, title, chapter, category] = process.argv;
if (!section || !title) {
  console.error('Usage: node scripts/queue-add.mjs "<section>" "<title>" "[chapter]" "[category]"');
  process.exit(1);
}

const SECTIONS_JSON = path.join(process.cwd(), "content", "sections.json");
const queue = loadQueue();

const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

const id = `itax2025-s${String(section).padStart(3, "0")}`;

if (queue.items.some((i) => i.id === id || i.slug === slug)) {
  console.error(`An item with id "${id}" or slug "${slug}" already exists. Not adding a duplicate.`);
  process.exit(1);
}

queue.items.push({
  id,
  act: "Income-tax Act, 2025",
  section: String(section),
  title,
  chapter: chapter || "Uncategorised",
  category: category || "Uncategorised",
  status: "pending",
  slug,
  published_date: null,
  last_verified: null,
  sources: []
});

fs.writeFileSync(SECTIONS_JSON, JSON.stringify(queue, null, 2) + "\n", "utf-8");
console.log(`Added ${id} (${slug}) to the queue as "pending".`);
