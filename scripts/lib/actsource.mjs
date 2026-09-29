// Fetches the official Act and returns its text. Used by the seed step and the daily check.
//   1. ACT_TEXT_FILE  -> use an already-extracted text file (testing / manual)
//   2. download the official PDF from the Income Tax Department
//   3. if the download is blocked, use content/act/act-2025.pdf (upload it to the repo yourself)

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export const PDF_URL = process.env.ACT_PDF_URL || "https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf";
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export async function fetchActText() {
  if (process.env.ACT_TEXT_FILE) {
    const t = fs.readFileSync(process.env.ACT_TEXT_FILE, "utf-8");
    return { text: t, sha256: sha(t), origin: "text file" };
  }
  let bytes = null, origin = "";
  try {
    const res = await fetch(PDF_URL, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", accept: "application/pdf,*/*" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.subarray(0, 4).toString() !== "%PDF") throw new Error("the response was not a PDF");
    origin = "official website";
  } catch (e) {
    const local = path.join(process.cwd(), "content", "act", "act-2025.pdf");
    if (fs.existsSync(local)) { bytes = fs.readFileSync(local); origin = "content/act/act-2025.pdf (uploaded copy)"; }
    else throw new Error(`Could not download the official PDF (${e.message}). Upload the PDF to content/act/act-2025.pdf in the repository and run again.`);
  }
  const pdf = path.join(os.tmpdir(), "act2025.pdf"), txt = path.join(os.tmpdir(), "act2025.txt");
  fs.writeFileSync(pdf, bytes);
  execFileSync("pdftotext", ["-layout", "-nopgbrk", "-enc", "UTF-8", pdf, txt]);
  return { text: fs.readFileSync(txt, "utf-8"), sha256: sha(bytes), origin };
}
