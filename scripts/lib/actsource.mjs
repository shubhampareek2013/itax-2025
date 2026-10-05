// Fetches the current Income-tax Act, 2025 text.
// Deterministic source acquisition: official Income Tax Department PDF first,
// curl retry second. If the official government source is unavailable, fail closed:
// legal-source integrity is more important than keeping the publishing job green.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export const PDF_URL =
  process.env.ACT_PDF_URL ||
  "https://www.incometaxindia.gov.in/documents/d/guest/income_tax_act_2025_as_amended_by_fa_act_2026-pdf";

export const FALLBACK_PDF_URL =
  process.env.ACT_FALLBACK_PDF_URL ||
  "https://taxconcept.net/wp-content/uploads/2026/04/91774dtc-aps4792.pdf";

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function assertPdf(bytes) {
  if (bytes.subarray(0, 4).toString() !== "%PDF") throw new Error("the response was not a PDF");
}

async function fetchPdf(url, label) {
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0", accept: "application/pdf,*/*" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  assertPdf(bytes);
  return { bytes, origin: label };
}

function fetchPdfWithCurl(url, label) {
  const tmp = path.join(os.tmpdir(), "act2025-official.pdf");
  execFileSync("curl", ["-fL", "--retry", "3", "--retry-delay", "2", "-A", "Mozilla/5.0", "-H", "Accept: application/pdf,*/*", "-o", tmp, url], { stdio: "ignore" });
  const bytes = fs.readFileSync(tmp);
  assertPdf(bytes);
  return { bytes, origin: label };
}

export async function fetchActText() {
  if (process.env.ACT_TEXT_FILE) {
    const text = fs.readFileSync(process.env.ACT_TEXT_FILE, "utf-8");
    return { text, sha256: sha(text), origin: "text file" };
  }
  let bytes;
  let origin;
  try {
    ({ bytes, origin } = await fetchPdf(PDF_URL, "official website"));
  } catch (officialError) {
    try {
      ({ bytes, origin } = fetchPdfWithCurl(PDF_URL, "official website (curl fallback)"));
    } catch (curlError) {
      throw new Error(`Official Income Tax Department Act PDF unavailable (${officialError.message}; curl: ${curlError.message}). Refusing secondary/legal-source fallback.`);
    }
  }
  const pdf = path.join(os.tmpdir(), "act2025.pdf");
  const txt = path.join(os.tmpdir(), "act2025.txt");
  fs.writeFileSync(pdf, bytes);
  execFileSync("pdftotext", ["-layout", "-nopgbrk", "-enc", "UTF-8", pdf, txt]);
  return { text: fs.readFileSync(txt, "utf-8"), sha256: sha(bytes), origin };
}
