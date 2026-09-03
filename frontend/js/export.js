/**
 * Q&A-Export: CSV-Download und druckbares PDF (Browser-Druckdialog).
 */

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/**
 * @param {Array} questions
 * @param {string} code
 */
export function questionsToCsv(questions, code) {
  const lines = ["code,id,text,upvotes,status,user"];
  for (const q of questions || []) {
    const user = `User_${String(q.authorId || "anon").slice(0, 4)}`;
    lines.push([code, q.id, csvEscape(q.text), q.upvotes || 0, q.status || "", user].join(","));
  }
  return lines.join("\n");
}

export function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Öffnet ein Druckfenster — speichern als PDF über den Systemdialog.
 */
export function printQuestionsPdf(questions, meta = {}) {
  const rows = (questions || [])
    .map(
      (q) =>
        `<tr><td>${escapeHtml(q.text)}</td><td>${q.upvotes || 0}</td><td>${escapeHtml(q.status || "")}</td><td>User_${String(q.authorId || "anon").slice(0, 4)}</td></tr>`
    )
    .join("");
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Q&A ${meta.code || ""}</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 24px; color: #222; }
      h1 { font-size: 1.4rem; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: top; }
      /* Stadtblau + Weiß (4,51:1); Orange als Tabellen-Text würde AA verfehlen. */
      th { background: #007cc1; color: #ffffff; }
    </style></head><body>
    <h1>Pulse — Q&amp;A ${meta.code || ""}</h1>
    <p>${escapeHtml(meta.question || "")}</p>
    <table><thead><tr><th>Frage</th><th>Upvotes</th><th>Status</th><th>Person</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/** Sehr kleines Markdown: Zeilenumbruch, **fett**, [Text](url). */
export function simpleMarkdown(src) {
  const escaped = String(src || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.+?)\]\((https?:\/\/[^)]+|#[^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\n/g, "<br>");
}
