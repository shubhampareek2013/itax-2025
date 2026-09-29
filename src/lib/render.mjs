export const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Highlighted change: removed words struck through in red, added words underlined in green.
export function renderHunks(hunks) {
  return hunks.map((h) =>
    `<div class="hunk">${h.before_gap ? "<span class='gap'>…</span> " : ""}` +
    h.segments.map((s) => s.k === "del" ? `<del>${esc(s.t)}</del>` : s.k === "add" ? `<ins>${esc(s.t)}</ins>` : esc(s.t)).join("") +
    `${h.after_gap ? " <span class='gap'>…</span>" : ""}</div>`
  ).join("");
}

export const DIFF_CSS = `
  .hunk { font-size: 15px; line-height: 1.7; padding: 14px 16px; border-radius: 14px; background: var(--bg-2); margin: 10px 0; }
  .hunk del { background: rgba(255,59,48,.14); color: #c4271c; text-decoration: line-through; padding: 0 2px; border-radius: 3px; }
  .hunk ins { background: rgba(52,199,89,.18); color: #1a7f37; text-decoration: none; padding: 0 2px; border-radius: 3px; font-weight: 500; }
  .hunk .gap { color: var(--text-2); }
  :root[data-theme="dark"] .hunk del { color: #ff8a80; } :root[data-theme="dark"] .hunk ins { color: #6be08a; }
  .legend { font-size: 13px; color: var(--text-2); } .legend del { background: rgba(255,59,48,.14); padding: 0 4px; border-radius: 3px; } .legend ins { background: rgba(52,199,89,.18); padding: 0 4px; border-radius: 3px; text-decoration: none; }
`;
