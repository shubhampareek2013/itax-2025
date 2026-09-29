// Splits the official Income-tax Act, 2025 text (pdftotext output) into sections.
// Deterministic — no AI. Section titles, numbers, chapters and the statutory text
// all come straight from the official document.

const TERMINAL = /[.;:,—)’”]$/;
const isChapterLine = (l) => /^CHAPTER\s+[IVXLC]+(-[A-Z])?$/.test(l);
const isPartLine = (l) => /^[A-Z]{1,2}\.\s?[—–-]/.test(l);
const isUpperLine = (l) => /^[A-Z0-9 ,’'&()\-—–:]+$/.test(l) && /[A-Z]/.test(l);
const FOOT = /^\d+[a-z]?\.\s+(Substituted|Omitted|Inserted|Amended|Added|Words|Item|Items|Renumbered|Re-numbered|Ins\.|Subs\.)/i;

const sentence = (s) => { s = s.toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };

export function parseAct(rawText, { lastSection = 536 } = {}) {
  const lines = rawText\n    .replace(/\r/g, "")\n    .replace(/\f/g, "\n")\n    .replace(/\u00a0/g, " ")\n    .split("\n")\n    .map((l) => l.replace(/\s+$/, "").trim())\n    .filter((l) => l !== "" && !/^\d+$/.test(l));
  const start = lines.findIndex((l) => /^CHAPTER I$/.test(l));
  if (start < 0) throw new Error('Could not find "CHAPTER I" in the text — is this the Act?');

  let expected = 1, endIdx = lines.length;
  let chapter = { roman: "I", name: "" }, part = "";
  let headStart = null, headLast = -1;
  const found = [];
  const missing = [];

  for (let i = start; i < lines.length; i++) {
    const l = lines[i];

    if (isChapterLine(l)) {
      const roman = l.replace("CHAPTER", "").trim();
      const nameParts = [];
      let k = i + 1;
      while (k < lines.length && isUpperLine(lines[k]) && !isChapterLine(lines[k]) && nameParts.length < 3) {
        nameParts.push(lines[k]);
        k++;
      }
      chapter = { roman, name: sentence(nameParts.join(" ")) };
      part = "";
      if (headStart === null) headStart = i;
      headLast = k - 1;
      i = k - 1;
      continue;
    }

    if (isPartLine(l) && found.length) {
      part = l.replace(/^[A-Z]{1,2}\.\s?[—–-]\s*/, "");
      if (headStart === null) headStart = i;
      headLast = i;
      continue;
    }

    if (/^SCHEDULE\s+[IVXLC]+\b/.test(l) && expected > lastSection - 40) {
      endIdx = i;
      break;
    }

    const m = l.match(/^(\d{1,3})\.\s+(.+)$/);
    if (!m || FOOT.test(l)) continue;

    const n = Number(m[1]);
    const body = m[2].trim();
    const bodyOk = /^(?:\(|[A-Z“‘]|\d)/.test(body);

    if (!bodyOk || n > lastSection) continue;

    const prevLine = lines[i - 1] || "";
    let title = `Section ${n}`;

    const prevTrim = prevLine.trim();
    if (prevTrim && prevTrim.length < 220 && /[A-Za-z]/.test(prevTrim)) {
      const likelyTitle = prevTrim.replace(/\.$/, "").trim();
      if (
        likelyTitle &&
        !/^CHAPTER\s+/i.test(likelyTitle) &&
        !/^SCHEDULE\s+/i.test(likelyTitle) &&
        !/^\d+\.$/.test(likelyTitle) &&
        !/^PART\s+/i.test(likelyTitle)
      ) {
        title = likelyTitle;
      }
    }

    if (n > expected) {
      for (let q = expected; q < n; q++) missing.push(q);
    }

    found.push({
      n,
      title,
      idx: i,
      bodyBoundary: headStart !== null ? Math.min(headStart, i) : i,
      chapterRoman: chapter.roman,
      chapterName: chapter.name,
      part
    });

    expected = n + 1;
    headStart = null;
  }

  const sections = found.map((s, k) => {
    const end = k + 1 < found.length ? found[k + 1].bodyBoundary : endIdx;
    let text = lines.slice(s.idx, Math.max(end, s.idx + 1)).join("\n");
    if (text.length > 400000) text = text.slice(0, 400000);
    return { n: s.n, title: s.title, chapterRoman: s.chapterRoman, chapterName: s.chapterName, part: s.part, text };
  });

  return { sections, missing, lastFound: found.length ? found[found.length - 1].n : 0 };
}

export function categoryFor(chapterName = "", part = "") {
  const s = `${chapterName} ${part}`.toLowerCase();
  const rules = [
    [/collection of tax at source|\btcs\b/, "TCS"],
    [/deduction of tax at source|tax deduction at source|\btds\b/, "TDS"],
    [/salar/, "Salary"],
    [/house property/, "House Property"],
    [/business or profession|profits and gains/, "Business & Profession"],
    [/capital gain/, "Capital Gains"],
    [/other sources/, "Other Sources"],
    [/transfer pric|arm.s length|specified domestic transaction/, "Transfer Pricing"],
    [/international|non-resident|double taxation|foreign|treaty/, "International Taxation"],
    [/trust|charit|religious|institution/, "Charitable Trusts"],
    [/penalt|offence|prosecution/, "Penalties"],
    [/appeal|revision|tribunal/, "Appeals"],
    [/assessment|reassessment|search|seizure|survey/, "Assessments"],
    [/return/, "Returns"],
    [/deduction/, "Deductions"],
    [/compan|minimum alternate/, "Companies"],
    [/firm|partnership|limited liability/, "Firms"],
    [/advance tax|refund|interest|recovery|payment/, "Compliance"],
    [/authorit|administration|jurisdiction|power/, "Tax Administration"]
  ];
  for (const [re, cat] of rules) if (re.test(s)) return cat;
  return "General";
}
