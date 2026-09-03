# Kontrastprüfung (WCAG 2.1 AA)

Berechnet mit der WCAG-Formel für relative Luminanz (sRGB):

1. `R' = R/255` (ebenso G, B)
2. Linearisierung: `C <= 0,04045 → C/12,92`, sonst `((C+0,055)/1,055)^2,4`
3. `L = 0,2126 R + 0,7152 G + 0,0722 B`
4. Kontrast = `(Lhell + 0,05) / (Ldunkel + 0,05)`

Schwellen: Text **4,5:1**, großer Text **3:1**, UI/Border/Icon **3:1**.

Orange-Akzent `#F99700` (und historisches Gelb `#FFCC00`) wird **nicht** als Text auf Weiß verwendet.

## Herkunft der Markenfarben (Stand 2026-09-02)

Abgelesen von der Live-Website [saarbruecken.de](https://www.saarbruecken.de) (Theme `saarbruecken_2019`, CSS-Bundle `cache/media/css/ebb4190ff6a3da102592063bc9bbca03.css` und Logo `/media/saarbruecken_2019/img/logo.svg`). Klassisches Navy `#003399` / Gelb `#FFCC00` kommt dort **nicht** vor.

| Token | Hex | Stelle auf der Website |
|---|---|---|
| primary | `#007CC1` | CSS `a { color: #007cc1 }`, `.button` / `.button.primary` / `.blue` / `.no_theme`; Homepage-CTA `background-color: #007CC1`. Logo-Welle `.cls-2 { fill: #007bc2 }` (1/255 Abweichung). Hover `#005B8E`. |
| secondary | `#F99700` | CSS-Klasse `.orange` (Hauptnavigation „Leben“), ~80 Treffer im Theme. Die Klasse `.lemon` ist Grün `#71AE13` (Bildung), kein Gelb. |
| bg | `#FFFFFF` | `body { background: #fff }`, Header `.top-navigation { background-color: #fff }`, `theme-color` / `msapplication-TileColor`. |
| text | `#1A171B` | Logo-Wortmarke `.cls-1 { fill: #1a171b }`. Body-CSS `color: #000`, Header `color: #2b2b2b`. |

## Light Mode

| Vordergrund | Hintergrund | Verhältnis | Soll | AA | Verwendung |
|---|---|---|---|---|---|
| `#1a1d23` | `#ffffff` | 16.88:1 | 4.5:1 | ja | Primärtext auf Elevated |
| `#1a1d23` | `#f4f6f8` | 15.58:1 | 4.5:1 | ja | Primärtext auf Seitenhintergrund |
| `#3d4450` | `#ffffff` | 9.81:1 | 4.5:1 | ja | Sekundärtext auf Elevated |
| `#3d4450` | `#f4f6f8` | 9.05:1 | 4.5:1 | ja | Sekundärtext auf Seite |
| `#4a5568` | `#ffffff` | 7.53:1 | 4.5:1 | ja | Placeholder auf Elevated |
| `#4a5568` | `#e8ecf0` | 6.34:1 | 4.5:1 | ja | Placeholder auf Input-Soft |
| `#ffffff` | `#007cc1` | 4.51:1 | 4.5:1 | ja | Button-Text auf Stadtblau-Primary |
| `#ffffff` | `#0052cc` | 6.82:1 | 4.5:1 | ja | Button-Text auf Link-Blau (Fallback) |
| `#0052cc` | `#ffffff` | 6.82:1 | 4.5:1 | ja | Link-Fallback auf Weiß |
| `#0052cc` | `#f4f6f8` | 6.30:1 | 4.5:1 | ja | Link-Fallback auf Seite |
| `#007cc1` | `#ffffff` | 4.51:1 | 4.5:1 | ja | Stadtblau als Link auf Weiß (nach Branding-BG) |
| `#005b8e` | `#ffffff` | 7.27:1 | 4.5:1 | ja | Link-Hover (CSS `.button:hover`) |
| `#1a1d23` | `#f99700` | 7.60:1 | 4.5:1 | ja | Text auf Orange-Fläche (einzige erlaubte Akzent-Nutzung) |
| `#6b7280` | `#ffffff` | 4.83:1 | 3:1 | ja | Border auf Elevated |
| `#6b7280` | `#f4f6f8` | 4.46:1 | 3:1 | ja | Border auf Seite |
| `#6b7280` | `#e8ecf0` | 4.07:1 | 3:1 | ja | Input-Border auf Soft |
| `#ffffff` | `#b42318` | 6.57:1 | 4.5:1 | ja | Poll-Balken 1 |
| `#ffffff` | `#0f6b3d` | 6.58:1 | 4.5:1 | ja | Poll-Balken 2 |
| `#ffffff` | `#007cc1` | 4.51:1 | 4.5:1 | ja | Poll-Balken 3 |
| `#ffffff` | `#b45309` | 5.02:1 | 4.5:1 | ja | Poll-Balken 4 |
| `#ffffff` | `#6b21a8` | 8.72:1 | 4.5:1 | ja | Poll-Balken 5 |
| `#ffffff` | `#0e7490` | 5.36:1 | 4.5:1 | ja | Poll-Balken 6 |
| `#1a1d23` | `#86efac` | 12.02:1 | 4.5:1 | ja | Badge OK |
| `#1a1d23` | `#facc15` | 11.02:1 | 4.5:1 | ja | Badge Warn |
| `#7f1d1d` | `#fca5a5` | 5.28:1 | 4.5:1 | ja | Badge Fehler |
| `#1e3a8a` | `#93c5fd` | 5.74:1 | 4.5:1 | ja | Badge Info |
| `#1a1d23` | `#cbd5e1` | 11.37:1 | 4.5:1 | ja | Badge ausstehend |
| `#c2410c` | `#f4f6f8` | 4.78:1 | 4.5:1 | ja | Quiz-Timer Warn (Text) |
| `#b91c1c` | `#f4f6f8` | 5.97:1 | 4.5:1 | ja | Quiz-Timer kritisch (Text) |
| `#ffffff` | `#9b1c1c` | 8.15:1 | 4.5:1 | ja | Notfall-Button |
| `#1a171b` | `#ffffff` | 17.76:1 | 4.5:1 | ja | Branding-Text Logo-Schwarz (Light) |

### Bewusst durchgefallen (nicht als Text nutzen)

| Vordergrund | Hintergrund | Verhältnis | Soll | AA | Verwendung |
|---|---|---|---|---|---|
| `#f99700` | `#ffffff` | 2.22:1 | 4.5:1 | **nein** | Orange-Akzent als Text auf Weiß — verboten |
| `#ffffff` | `#f99700` | 2.22:1 | 4.5:1 | **nein** | Weißer Text auf Orange — verboten |
| `#007cc1` | `#f4f6f8` | 4.17:1 | 4.5:1 | **nein** | Stadtblau als Link auf Seiten-Grau — Theme-Link `#0052cc` bleibt |
| `#ffcc00` | `#ffffff` | 1.51:1 | 4.5:1 | **nein** | Historisches Gelb (nicht mehr auf der Stadtseite) |

## Dark Mode

| Vordergrund | Hintergrund | Verhältnis | Soll | AA | Verwendung |
|---|---|---|---|---|---|
| `#e8eaed` | `#1c2128` | 13.43:1 | 4.5:1 | ja | Primärtext auf Seite |
| `#e8eaed` | `#252b34` | 11.82:1 | 4.5:1 | ja | Primärtext auf Elevated |
| `#e8eaed` | `#2c3440` | 10.42:1 | 4.5:1 | ja | Primärtext auf Soft |
| `#c5cad3` | `#1c2128` | 9.84:1 | 4.5:1 | ja | Sekundärtext / Placeholder auf Seite |
| `#c5cad3` | `#252b34` | 8.66:1 | 4.5:1 | ja | Sekundärtext auf Elevated |
| `#c5cad3` | `#2c3440` | 7.63:1 | 4.5:1 | ja | Sekundärtext auf Soft |
| `#7eb6ff` | `#1c2128` | 7.72:1 | 4.5:1 | ja | Link / Primary-Fläche vs. Seite |
| `#7eb6ff` | `#252b34` | 6.80:1 | 4.5:1 | ja | Link auf Elevated |
| `#1a1d23` | `#7eb6ff` | 8.06:1 | 4.5:1 | ja | Button-Text auf Primary-Fallback (Dark) |
| `#a8cfff` | `#1c2128` | 10.05:1 | 4.5:1 | ja | Link-Hover |
| `#ffffff` | `#007cc1` | 4.51:1 | 4.5:1 | ja | Button-Text, wenn Stadtblau als Dark-Fläche greift |
| `#1a1d23` | `#f99700` | 7.60:1 | 4.5:1 | ja | Text auf Orange-Fläche |
| `#9aa3b0` | `#1c2128` | 6.35:1 | 3:1 | ja | Border auf Seite |
| `#9aa3b0` | `#252b34` | 5.59:1 | 3:1 | ja | Border auf Elevated |
| `#1a1d23` | `#ff8a70` | 7.33:1 | 4.5:1 | ja | Poll-Balken 1 (dunkler Text) |
| `#1a1d23` | `#5ee0a8` | 10.21:1 | 4.5:1 | ja | Poll-Balken 2 |
| `#1a1d23` | `#7eb6ff` | 8.06:1 | 4.5:1 | ja | Poll-Balken 3 |
| `#1a1d23` | `#ffd166` | 11.71:1 | 4.5:1 | ja | Poll-Balken 4 |
| `#1a1d23` | `#c084fc` | 6.39:1 | 4.5:1 | ja | Poll-Balken 5 |
| `#1a1d23` | `#22d3ee` | 9.34:1 | 4.5:1 | ja | Poll-Balken 6 |
| `#ff8a70` | `#1c2128` | 7.03:1 | 3:1 | ja | Poll 1 vs. Seite (UI) |
| `#5ee0a8` | `#1c2128` | 9.79:1 | 3:1 | ja | Poll 2 vs. Seite (UI) |
| `#fb923c` | `#1c2128` | 7.15:1 | 4.5:1 | ja | Quiz-Timer Warn (Text) |
| `#f87171` | `#1c2128` | 5.85:1 | 4.5:1 | ja | Quiz-Timer kritisch (Text) |

### Branding-Fallen (Theme-Fallback greift)

| Vordergrund | Hintergrund | Verhältnis | Soll | AA | Verwendung |
|---|---|---|---|---|---|
| `#1a171b` | `#1c2128` | 1.10:1 | 4.5:1 | **nein** | Branding-Text Light auf Dark-BG — nicht übernehmen |
| `#007cc1` | `#1c2128` | 3.59:1 | 4.5:1 | **nein** (Text) / **ja** (UI 3:1) | Stadtblau als Dark-Link zu schwach; als Button-Fläche erlaubt |

## Notes

- Light ist Standard (`:root` / `data-theme="light"`). Dark nur bei `localStorage.pulse-theme === "dark"`.
- `applyBrandingContrast()` in `frontend/js/theme.js` setzt Markenfarben nur, wenn Text-AA und Flächen-UI-Kontrast erfüllt sind. Orange/Gelb wird immer nur als Fläche plus dunklem Text gesetzt.
- Formel und Werte können mit `npm run test:theme` nachgerechnet werden.
