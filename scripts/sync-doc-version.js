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

/** Datei lesen/schreiben mit Ersetzungen. */
function patch(relPath, replacers) {
  const filePath = path.join(ROOT, relPath);
  if (!fs.existsSync(filePath)) {
    console.warn(`docs:sync-version — übersprungen (fehlt): ${relPath}`);
    return;
  }
  let text = fs.readFileSync(filePath, "utf8");
  for (const [pattern, replacement] of replacers) {
    text = text.replace(pattern, replacement);
  }
  fs.writeFileSync(filePath, text);
}

/** Alle Markdown-Dateien unter docs/ mit generischem Programmversions-Stand. */
function patchGenericDocStands() {
  const skip = new Set([
    "docs/hilfe.md",
    "docs/projektdokumentation.md",
    "docs/installation.md",
    "docs/verfahrensverzeichnis.md",
  ]);
  const docsRoot = path.join(ROOT, "docs");
  const walk = (dir, out = []) => {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (fs.statSync(abs).isDirectory()) walk(abs, out);
      else if (name.endsWith(".md")) out.push(abs);
    }
    return out;
  };

  for (const abs of walk(docsRoot)) {
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    if (skip.has(rel)) continue;

    const original = fs.readFileSync(abs, "utf8");
    let text = original;

    const standPatterns = [
      [/^\*\*Stand:\*\* Programmversion \*\*v[\d.]+\*\* · \d{4}-\d{2}-\d{2}\.$/m, `**Stand:** Programmversion **${appLabel}** · ${date}.`],
      [
        /^\*\*Stand:\*\* Programmversion \*\*v[\d.]+\*\* · Ist-Zustand aus dem Quellcode, \d{4}-\d{2}-\d{2}\.$/m,
        `**Stand:** Programmversion **${appLabel}** · Ist-Zustand aus dem Quellcode, ${date}.`,
      ],
      [/^\*\*Stand:\*\* \d{4}-\d{2}-\d{2} · \*\*Programmversion:\*\* v[\d.]+$/m, `**Stand:** ${date} · **Programmversion:** ${appLabel}`],
    ];

    for (const [pattern, replacement] of standPatterns) {
      text = text.replace(pattern, replacement);
    }

    text = text.replace(
      /Hilfe-Katalog [`']articles\.json[`'], \*\*Version \d+\*\*, Programm \*\*v[\d.]+\*\*/g,
      `Hilfe-Katalog \`articles.json\`, **Version ${catalogVersion}**, Programm **${appLabel}**`,
    );

    if (text !== original) {
      fs.writeFileSync(abs, text);
    }
  }
}

patch("docs/hilfe.md", [
  [
    /^\*\*Stand:\*\* Programmversion \*\*v[\d.]+\*\* · Hilfe-Katalog \*\*Version \d+\*\* · \*\*\d+ Artikel\*\* · \d{4}-\d{2}-\d{2}\.$/m,
    `**Stand:** Programmversion **${appLabel}** · Hilfe-Katalog **Version ${catalogVersion}** · **${articleCount} Artikel** · ${date}.`,
  ],
  [
    /`frontend\/help\/articles\.json` \| Hilfe-Katalog v\d+ · Programm v[\d.]+ \(\d+ Artikel\)/,
    `\`frontend/help/articles.json\` | Hilfe-Katalog v${catalogVersion} · Programm ${appLabel} (${articleCount} Artikel)`,
  ],
  [
    /^\*Bei Abweichungen gilt der Stand der HTML-Artikel unter `frontend\/help\/` \(Programmversion \*\*v[\d.]+\*\*, Katalog-Version in `articles\.json`\)\.\*$/m,
    `*Bei Abweichungen gilt der Stand der HTML-Artikel unter \`frontend/help/\` (Programmversion **${appLabel}**, Katalog-Version **${catalogVersion}** in \`articles.json\`).*`,
  ],
]);

patch("docs/projektdokumentation.md", [
  [
    /^\*\*Stand:\*\* Programmversion \*\*v[\d.]+\*\* · Ist-Zustand aus dem Quellcode, \d{4}-\d{2}-\d{2}\.$/m,
    `**Stand:** Programmversion **${appLabel}** · Ist-Zustand aus dem Quellcode, ${date}.`,
  ],
  [
    /\*\*Markdown-Auszug für Druck\/Schulung:\*\* `docs\/hilfe\.md` \(\*\*\d+ Artikel\*\*, Stand Katalog \*\*Version \d+\*\*, Programm \*\*v[\d.]+\*\*\)\./,
    `**Markdown-Auszug für Druck/Schulung:** \`docs/hilfe.md\` (**${articleCount} Artikel**, Stand Katalog **Version ${catalogVersion}**, Programm **${appLabel}**).`,
  ],
  [
    /Stand Katalog \*\*Version \d+\*\*, Programm \*\*v[\d.]+\*\*\)\./,
    `Stand Katalog **Version ${catalogVersion}**, Programm **${appLabel}**).`,
  ],
]);

patch("docs/installation.md", [
  [
    /^\*\*Stand:\*\* Programmversion \*\*v[\d.]+\*\* · Ist-Zustand aus dem Repository \(Node ≥ 22, npm, optional Docker Compose\)\.$/m,
    `**Stand:** Programmversion **${appLabel}** · Ist-Zustand aus dem Repository (Node ≥ 22, npm, optional Docker Compose).`,
  ],
]);

patch("docs/verfahrensverzeichnis.md", [
  [/^\*\*Stand:\*\* \d{4}-\d{2}-\d{2} · \*\*Programmversion:\*\* v[\d.]+$/m, `**Stand:** ${date} · **Programmversion:** ${appLabel}`],
  [
    /Katalog `articles\.json`, \*\*Version \d+\*\*, Programm \*\*v[\d.]+\*\*/,
    `Katalog \`articles.json\`, **Version ${catalogVersion}**, Programm **${appLabel}**`,
  ],
  [/Quellcode Stand 2026-\d{2}-\d{2}/, `Quellcode Stand ${date}`],
]);

patch("docs/feature-freeze.md", [
  [/^\*\*Basisversion:\*\* [\d.]+$/m, `**Basisversion:** ${appVersion}`],
  [/^\*\*Ziel:\*\* Stabilitätsrelease v[\d.]+\.x$/m, `**Ziel:** Stabilitätsrelease ${appLabel} (Stabilisierungszyklus)`],
]);

patch("docs/stabilization/architecture-operation-modes.md", [
  [/^Stand: v[\d.]+ · Status:/m, `Stand: ${appLabel} · Status:`],
]);

patch("docs/stabilization/operations-runbook.md", [
  [/^# Operations-Runbook — Pulse v[\d.]+ \(Audit\)$/m, `# Operations-Runbook — Pulse ${appLabel}`],
]);

patch("frontend/help/related-docs.html", [
  [
    /Gesamte Benutzerhilfe als Markdown \(druckbar, Katalog v\d+, Programm v[\d.]+, \d+ Artikel\)/,
    `Gesamte Benutzerhilfe als Markdown (druckbar, Katalog v${catalogVersion}, Programm ${appLabel}, ${articleCount} Artikel)`,
  ],
]);

patch("frontend/help/guides/participant.html", [
  [
    /<p class="muted">(?:Pulse v[\d.]+ · )?Hilfe(?:-Katalog)? v\d+ · Stand .* · Online: <code>#\/help\/roles-participant<\/code> · Picker: <code>#\/help\/picker<\/code><\/p>/,
    `<p class="muted">Pulse ${appLabel} · Hilfe-Katalog v${catalogVersion} · Stand ${date} · Online: <code>#/help/roles-participant</code> · Picker: <code>#/help/picker</code></p>`,
  ],
]);

patch("frontend/help/guides/presenter.html", [
  [
    /<p class="muted">(?:Pulse v[\d.]+ · )?Hilfe(?:-Katalog)? v\d+ · Stand .* · Online: <code>#\/help<\/code> · Picker: <code>#\/help\/picker<\/code><\/p>/,
    `<p class="muted">Pulse ${appLabel} · Hilfe-Katalog v${catalogVersion} · Stand ${date} · Online: <code>#/help</code> · Picker: <code>#/help/picker</code></p>`,
  ],
]);

const adminChecklistPath = path.join(ROOT, "frontend/help/guides/admin-checklist.html");
let adminChecklist = fs.readFileSync(adminChecklistPath, "utf8");
const adminFooter = `<footer class="help-guide-version">\n      <p class="muted">Pulse ${appLabel} · Hilfe-Katalog v${catalogVersion} · Stand ${date}</p>\n    </footer>`;
if (!adminChecklist.includes("help-guide-version")) {
  adminChecklist = adminChecklist.replace(
    "    </main>\n    <script>",
    `    </main>\n    ${adminFooter}\n    <script>`,
  );
} else {
  adminChecklist = adminChecklist.replace(/<footer class="help-guide-version">[\s\S]*?<\/footer>/, adminFooter);
}
fs.writeFileSync(adminChecklistPath, adminChecklist);

const backupsHelpPath = path.join(ROOT, "frontend/help/backups.html");
let backupsHelp = fs.readFileSync(backupsHelpPath, "utf8");
const backupsFooter = `<footer class="help-guide-version">\n    <p class="muted">Pulse ${appLabel} · Hilfe-Katalog v${catalogVersion} · Dokumentation bezieht sich auf die installierte Programmversion.</p>\n  </footer>`;
if (!backupsHelp.includes("help-guide-version")) {
  backupsHelp = backupsHelp.replace("</body>", `  ${backupsFooter}\n</body>`);
} else {
  backupsHelp = backupsHelp.replace(/<footer class="help-guide-version">[\s\S]*?<\/footer>/, backupsFooter);
}
fs.writeFileSync(backupsHelpPath, backupsHelp);

patchGenericDocStands();

console.log(
  `docs:sync-version OK — Programm ${appLabel}, Hilfe-Katalog v${catalogVersion}, ${articleCount} Artikel`,
);
