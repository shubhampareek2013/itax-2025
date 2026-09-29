import fs from "node:fs";
import path from "node:path";
import { loadQueue } from "../src/lib/content.mjs";
import { validateArticle } from "./validate.mjs";

const SECTIONS_JSON = path.join(process.cwd(), "content", "sections.json");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export async function publishNext() {
  const queue = loadQueue();
  const item = queue.items.find((i) => i.status === "draft");
  if (!item) return { published: false, reason: "no draft" };
  const { ok, errors } = await validateArticle(item.slug);
  if (!ok) {
    item.status = "failed";
    item.failure_reason = errors.join("; ").slice(0, 600);
    fs.writeFileSync(SECTIONS_JSON, JSON.stringify(queue, null, 2) + "\n", "utf-8");
    return { published: false, errors, item };
  }
  item.status = "published";
  item.published_date = today();
  item.last_verified = today();
  delete item.failure_reason;
  fs.writeFileSync(SECTIONS_JSON, JSON.stringify(queue, null, 2) + "\n", "utf-8");
  return { published: true, item };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await publishNext();
  console.log(r.published ? `Published Section ${r.item.section}` : `Not published: ${(r.errors || [r.reason]).join("; ")}`);
  if (!r.published) process.exitCode = 1;
}
