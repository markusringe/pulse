#!/usr/bin/env node
/**
 * Synchronisiert die Programmversion aus package.json in Hilfe und Markdown-Doku.
 * Aufruf: npm run docs:sync-version
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const appVersion = String(pkg.version || "0.0.0").trim();
const appLabel = `v${appVersion.replace(/^v/i, "")}`;
const date = new Date().toISOString().slice(0, 10);

const articlesPath = path.join(ROOT, "frontend/help/articles.json");
const articles = JSON.parse(fs.readFileSync(articlesPath, "utf8"));
articles.appVersion = appVersion;
const catalogVersion = articles.version;
const articleCount = Array.isArray(articles.articles) ? articles.articles.length : 0;
fs.writeFileSync(articlesPath, `${JSON.stringify(articles, null, 2)}\n`);

function patch(relPath, replacers) {
  const filePath = path.join(ROOT, relPath);
  let text = fs.readFileSync(filePath, "utf8");
  for (const [pattern, replacement] of replacers) {
    if (typeof replacement === "function") {
      text = text.replace(pattern, replacement);
    } else {
      text = text.replace(pattern, replacement);
    }
  }
  fs.writeFileSync(filePath, text);
}

patch("docs/hilfe.md", [
  [
    /^\*\*Stand:\*\*.*$/m,
    `**Stand:** Programmversion **${appLabel}** · Hilfe-Katalog **Version ${catalogVersion}** · **${articleCount} Artikel** · ${date}.`,
  ],
  [
    /`frontend\/help\/articles\.json` \| Hilfe-Katalog v\d+ \(\d+ Artikel\)/,
    `\`frontend/help/articles.json\` | Hilfe-Katalog v${catalogVersion} · Programm ${appLabel} (${articleCount} Artikel)`,
  ],
  [
    /\(Version in `articles\.json`\)\./,
    `(Programmversion **${appLabel}**, Katalog-Version in \`articles.json\`).`,
  ],
]);

patch("docs/projektdokumentation.md", [
  [
    /^\*\*Stand:\*\*.*$/m,
    `**Stand:** Programmversion **${appLabel}** · Ist-Zustand aus dem Quellcode, ${date}.`,
  ],
  [
    /Stand Katalog \*\*Version \d+\*\*, Programm \*\*v[\d.]+\*\*\)\./,
    `Stand Katalog **Version ${catalogVersion}**, Programm **${appLabel}**).`,
  ],
  [
    /\*\*Markdown-Auszug für Druck\/Schulung:\*\* `docs\/hilfe\.md` \(\*\*\d+ Artikel\*\*, Stand Katalog \*\*Version \d+\*\*, Programm \*\*v[\d.]+\*\*\)\./,
    `**Markdown-Auszug für Druck/Schulung:** \`docs/hilfe.md\` (**${articleCount} Artikel**, Stand Katalog **Version ${catalogVersion}**, Programm **${appLabel}**).`,
  ],
]);

patch("docs/installation.md", [
  [
    /^\*\*Stand:\*\*.*$/m,
    `**Stand:** Programmversion **${appLabel}** · Ist-Zustand aus dem Repository (Node ≥ 22, npm, optional Docker Compose).`,
  ],
]);

patch("docs/verfahrensverzeichnis.md", [
  [
    /^\*\*Stand:\*\*.*$/m,
    `**Stand:** ${date} · **Programmversion:** ${appLabel}`,
  ],
  [
    /Hilfe-Katalog `articles\.json`, \*\*Version \d+\*\*, Programm \*\*v[\d.]+\*\*/,
    `Hilfe-Katalog \`articles.json\`, **Version ${catalogVersion}**, Programm **${appLabel}**`,
  ],
  [
    /Katalog `articles\.json`, \*\*Version \d+\*\*, Programm \*\*v[\d.]+\*\*; u\. a\./,
    `Katalog \`articles.json\`, **Version ${catalogVersion}**, Programm **${appLabel}**; u. a.`,
  ],
]);

patch("frontend/help/related-docs.html", [
  [
    /Version \d+, \d+ Artikel\)/,
    `Katalog v${catalogVersion}, Programm ${appLabel}, ${articleCount} Artikel)`,
  ],
]);

patch("frontend/help/guides/participant.html", [
  [
    /<p class="muted">(?:Pulse v[\d.]+ · )?Hilfe v\d+ · Stand .* · Online: <code>#\/help\/roles-participant<\/code> · Picker: <code>#\/help\/picker<\/code><\/p>/,
    `<p class="muted">Pulse ${appLabel} · Hilfe-Katalog v${catalogVersion} · Stand ${date} · Online: <code>#/help/roles-participant</code> · Picker: <code>#/help/picker</code></p>`,
  ],
]);

patch("frontend/help/guides/presenter.html", [
  [
    /<p class="muted">(?:Pulse v[\d.]+ · )?Hilfe v\d+ · Stand .* · Online: <code>#\/help<\/code> · Picker: <code>#\/help\/picker<\/code><\/p>/,
    `<p class="muted">Pulse ${appLabel} · Hilfe-Katalog v${catalogVersion} · Stand ${date} · Online: <code>#/help</code> · Picker: <code>#/help/picker</code></p>`,
  ],
]);

const adminChecklistPath = path.join(ROOT, "frontend/help/guides/admin-checklist.html");
let adminChecklist = fs.readFileSync(adminChecklistPath, "utf8");
if (!adminChecklist.includes("help-guide-version")) {
  adminChecklist = adminChecklist.replace(
    "    </main>\n    <script>",
    `    </main>\n    <footer class="help-guide-version">\n      <p class="muted">Pulse ${appLabel} · Hilfe-Katalog v${catalogVersion} · Stand ${date}</p>\n    </footer>\n    <script>`
  );
} else {
  adminChecklist = adminChecklist.replace(
    /<footer class="help-guide-version">[\s\S]*?<\/footer>/,
    `<footer class="help-guide-version">\n      <p class="muted">Pulse ${appLabel} · Hilfe-Katalog v${catalogVersion} · Stand ${date}</p>\n    </footer>`
  );
}
fs.writeFileSync(adminChecklistPath, adminChecklist);

const backupsHelpPath = path.join(ROOT, "frontend/help/backups.html");
let backupsHelp = fs.readFileSync(backupsHelpPath, "utf8");
const backupsFooter = `<footer class="help-guide-version">\n    <p class="muted">Pulse ${appLabel} · Hilfe-Katalog v${catalogVersion} · Dokumentation bezieht sich auf die installierte Programmversion.</p>\n  </footer>`;
if (!backupsHelp.includes("help-guide-version")) {
  backupsHelp = backupsHelp.replace("</body>", `  ${backupsFooter}\n</body>`);
} else {
  backupsHelp = backupsHelp.replace(
    /<footer class="help-guide-version">[\s\S]*?<\/footer>/,
    backupsFooter
  );
}
fs.writeFileSync(backupsHelpPath, backupsHelp);

console.log(`docs:sync-version OK — Programm ${appLabel}, Hilfe-Katalog v${catalogVersion}, ${articleCount} Artikel`);
