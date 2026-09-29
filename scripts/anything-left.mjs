// Exit code 0 if there is more work to do (unamended sections without a study guide,
// or failed items when RETRY_FAILED=1); exit code 1 if fully caught up.
import { loadQueue, hasSource, loadStudy } from "../src/lib/content.mjs";
const retry = process.env.RETRY_FAILED === "1";
const left = loadQueue().items.filter((i) => {
  if (!hasSource(i.id)) return false;
  const s = loadStudy(i.id);
  if (!s) return true;
  if (s.stale) return true;
  if (retry && s.status === "failed") return true;
  return false;
});
console.log(`${left.length} section(s) still need a study guide.`);
process.exit(left.length > 0 ? 0 : 1);
