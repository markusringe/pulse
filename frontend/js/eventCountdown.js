/**
 * Event-Countdown für Stage- und Presenter-Ansicht.
 * Berechnung lokal aus startTime; optional clockSkew aus serverNow.
 */

/** Erlaubte Countdown-Stile (persistiert am Event). */
export const COUNTDOWN_STYLES = ["classic", "modern", "retro"];

/** Stage-Hintergrundeffekte (getrennt vom Countdown-Stil). */
export const STAGE_EFFECTS = ["none", "sunrise", "waterfall", "parallax"];
export const STAGE_EFFECT_INTENSITIES = ["low", "medium", "high"];

/** Schwellen in Millisekunden. */
export const THRESH = {
  day: 24 * 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  fiveMin: 5 * 60 * 1000,
  minute: 60 * 1000,
};

/**
 * Countdown-Stil normalisieren (Default: modern).
 * @param {unknown} value
 * @returns {'classic'|'modern'|'retro'}
 */
export function sanitizeCountdownStyle(value) {
  const id = String(value || "modern")
    .trim()
    .toLowerCase();
  return COUNTDOWN_STYLES.includes(id) ? id : "modern";
}

/**
 * Stage-Effekt normalisieren (Default: none).
 * @param {unknown} value
 */
export function sanitizeStageEffect(value) {
  const id = String(value || "none")
    .trim()
    .toLowerCase();
  return STAGE_EFFECTS.includes(id) ? id : "none";
}

/**
 * Effekt-Intensität normalisieren (Default: medium).
 * @param {unknown} value
 */
export function sanitizeStageEffectIntensity(value) {
  const id = String(value || "medium")
    .trim()
    .toLowerCase();
  return STAGE_EFFECT_INTENSITIES.includes(id) ? id : "medium";
}

/**
 * Dekorative Effekt-Layer für die Stage (nur CSS, aria-hidden).
 * @param {string} [effect]
 * @param {string} [intensity]
 */
export function renderStageEffectLayers(effect, intensity) {
  const fx = sanitizeStageEffect(effect);
  if (fx === "none") return "";
  const level = sanitizeStageEffectIntensity(intensity);
  return `<div class="stage-effect stage-effect--${fx}" data-intensity="${esc(level)}" aria-hidden="true">
    <span class="stage-effect__layer stage-effect__layer--a"></span>
    <span class="stage-effect__layer stage-effect__layer--b"></span>
  </div>`;
}

/**
 * Startzeit für die Stage formatieren (ohne Sekunden).
 * @param {string} startTime ISO-8601
 * @param {string} [locale='de-DE']
 * @param {string} [timeZone]
 * @returns {string}
 */
export function formatEventStartDisplay(startTime, locale = "de-DE", timeZone) {
  const ms = Date.parse(String(startTime || ""));
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const opts = timeZone ? { timeZone } : {};
  const datePart = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...opts,
  }).format(d);
  const timePart = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...opts,
  }).format(d);
  if (String(locale).toLowerCase().startsWith("de")) {
    return `${datePart} · ${timePart} Uhr`;
  }
  return `${datePart} · ${timePart}`;
}

/**
 * Statuszeile für Countdown-UI (Stage-Hierarchie: Eventname → Status → Ziffern).
 * @param {number} ms Restzeit
 * @param {{ paused?: boolean, t?: (key: string) => string }} [opts]
 */
export function countdownStatusLabel(ms, opts = {}) {
  const tr = opts.t || ((k) => k);
  if (opts.paused) return tr("countdown.status.paused");
  if (ms <= 0) return tr("countdown.status.expired");
  return tr("countdown.status.running");
}

/**
 * Join-URL für die Stage-Karte verkürzen (Host + Pfad).
 * @param {string} url
 * @returns {string}
 */
export function formatJoinUrlDisplay(url) {
  try {
    const u = new URL(String(url || ""));
    const host = u.host.replace(/^www\./i, "");
    const path = u.pathname.replace(/\/$/, "") || "";
    return `${host}${path}`;
  } catch {
    return String(url || "")
      .replace(/^https?:\/\//i, "")
      .replace(/\/$/, "");
  }
}

/**
 * Verbleibende ms bis startTime (ISO), inkl. optionaler Client-Skew-Korrektur.
 * @param {string} startTime
 * @param {number} [clockSkew=0] — serverNow - Date.now()
 */
export function remainingMs(startTime, clockSkew = 0) {
  const end = Date.parse(startTime || "");
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - (Date.now() + clockSkew));
}

/**
 * Ob der Countdown noch angezeigt werden soll.
 * @param {{ startTime?: string } | null | undefined} meta
 * @param {number} [clockSkew]
 * @param {{ skipped?: boolean }} [opts]
 */
export function shouldShowCountdown(meta, clockSkew = 0, opts = {}) {
  if (opts.skipped) return false;
  if (meta?.countdownDismissed) return false;
  if (!meta?.startTime) return false;
  return remainingMs(meta.startTime, clockSkew) > 0;
}

/**
 * Lesbare Countdown-Teile.
 * @param {number} ms
 */
export function splitTime(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { days, hours, minutes, seconds, totalSec, ms };
}

/**
 * Deutscher Fließtext für den Countdown.
 * @param {number} ms
 */
export function formatCountdownLabel(ms) {
  const { days, hours, minutes, seconds, totalSec } = splitTime(ms);
  if (totalSec <= 0) return "Es geht los";
  if (totalSec < 60) return `Noch ${seconds} Sekunde${seconds === 1 ? "" : "n"}`;
  if (totalSec < 3600) {
    return `Noch ${minutes} Minute${minutes === 1 ? "" : "n"} und ${seconds} Sekunde${seconds === 1 ? "" : "n"}`;
  }
  const parts = [];
  if (days) parts.push(`${days} Tag${days === 1 ? "" : "e"}`);
  if (hours) parts.push(`${hours} Stunde${hours === 1 ? "" : "n"}`);
  if (minutes) parts.push(`${minutes} Minute${minutes === 1 ? "" : "n"}`);
  parts.push(`${seconds} Sekunde${seconds === 1 ? "" : "n"}`);
  if (parts.length === 1) return `Noch ${parts[0]}`;
  const last = parts.pop();
  return `Noch ${parts.join(", ")} und ${last}`;
}

/**
 * Urgency-Stufe für CSS.
 * @param {number} ms
 */
export function urgencyLevel(ms) {
  if (ms <= 0) return "started";
  if (ms < THRESH.minute) return "critical";
  if (ms < THRESH.fiveMin) return "imminent";
  if (ms < THRESH.hour) return "warn";
  if (ms < THRESH.day) return "soon";
  return "ok";
}

/**
 * Gemeinsame Countdown-UI — eine Render-Pipeline für Stage, Presenter-Vorschau und Startseite.
 * @param {{ title?: string, eventImage?: string, startTime?: string, countdownStyle?: string, showStageDateTime?: boolean, showStageQr?: boolean }} meta
 * @param {number} ms
 * @param {{
 *   variant?: 'stage'|'presenter'|'home',
 *   showSkip?: boolean,
 *   showStart?: boolean,
 *   skipLabel?: string,
 *   startLabel?: string,
 *   continueLabel?: string,
 *   showQr?: boolean,
 *   joinUrl?: string,
 *   locale?: string,
 *   timeZone?: string,
 *   paused?: boolean,
 *   t?: (key: string) => string,
 * }} [opts]
 */
export function renderCountdownPanel(meta, ms, opts = {}) {
  const parts = splitTime(ms);
  const urgency = urgencyLevel(ms);
  const imminent = ms > 0 && ms < THRESH.fiveMin;
  const variant = opts.variant || "stage";
  const style = sanitizeCountdownStyle(meta?.countdownStyle);
  const showDateTime =
    variant === "stage" && meta?.showStageDateTime !== false && Boolean(meta?.startTime);
  const locale = opts.locale || "de-DE";
  const datetime = showDateTime ? formatEventStartDisplay(meta.startTime, locale, opts.timeZone) : "";
  const status = countdownStatusLabel(ms, { paused: opts.paused, t: opts.t });
  const showQr = Boolean(opts.showQr && opts.joinUrl && variant === "stage");
  const joinUrlShort = showQr ? formatJoinUrlDisplay(opts.joinUrl) : "";

  const bg = meta?.eventImage
    ? `<div class="event-countdown-bg" style="background-image:url('${escapeAttr(meta.eventImage)}')" aria-hidden="true"></div>`
    : `<div class="event-countdown-bg event-countdown-bg--plain" aria-hidden="true"></div>`;

  const digits =
    parts.totalSec < 60
      ? `<div class="event-countdown-digits event-countdown-digits--sec"><span class="event-countdown-num">${parts.seconds}</span><span class="event-countdown-unit">${esc(opts.t?.("countdown.unit.seconds") || "Sekunden")}</span></div>`
      : parts.totalSec < 3600
        ? `<div class="event-countdown-digits">
            <div><span class="event-countdown-num">${pad(parts.minutes)}</span><span class="event-countdown-unit">${esc(opts.t?.("countdown.unit.min") || "Min")}</span></div>
            <div><span class="event-countdown-num">${pad(parts.seconds)}</span><span class="event-countdown-unit">${esc(opts.t?.("countdown.unit.sec") || "Sek")}</span></div>
          </div>`
        : `<div class="event-countdown-digits">
            ${parts.days ? `<div><span class="event-countdown-num">${parts.days}</span><span class="event-countdown-unit">${esc(opts.t?.("countdown.unit.days") || "Tage")}</span></div>` : ""}
            <div><span class="event-countdown-num">${pad(parts.hours)}</span><span class="event-countdown-unit">${esc(opts.t?.("countdown.unit.hours") || "Std")}</span></div>
            <div><span class="event-countdown-num">${pad(parts.minutes)}</span><span class="event-countdown-unit">${esc(opts.t?.("countdown.unit.min") || "Min")}</span></div>
            <div><span class="event-countdown-num">${pad(parts.seconds)}</span><span class="event-countdown-unit">${esc(opts.t?.("countdown.unit.sec") || "Sek")}</span></div>
          </div>`;

  return `
    ${bg}
    ${variant === "stage" ? renderStageEffectLayers(meta?.stageEffect, meta?.stageEffectIntensity) : ""}
    <div class="event-countdown-panel" data-urgency="${urgency}" data-variant="${esc(variant)}">
      ${meta?.title ? `<h1 class="event-countdown-title">${esc(meta.title)}</h1>` : ""}
      <p class="event-countdown-status" role="status">${esc(status)}</p>
      ${imminent ? `<p class="event-countdown-imminent">${esc(opts.t?.("countdown.imminent") || "In wenigen Augenblicken geht es los…")}</p>` : ""}
      ${digits}
      ${datetime ? `<p class="event-countdown-datetime">${esc(datetime)}</p>` : ""}
      ${showQr ? `<div class="event-countdown-qr-card">
        <p class="event-countdown-qr-hint">${esc(opts.t?.("countdown.qr.hint") || "Scannen zum Beitreten")}</p>
        <div class="event-countdown-qr">
          <canvas class="event-countdown-qr-canvas" width="200" height="200" data-join-url="${escapeAttr(opts.joinUrl)}" aria-label="${esc(opts.t?.("countdown.qr.label") || "QR-Code zum Beitreten")}"></canvas>
        </div>
        <p class="event-countdown-qr-url" aria-hidden="true">${esc(joinUrlShort)}</p>
      </div>` : ""}
      <p class="event-countdown-label sr-only">${esc(formatCountdownLabel(ms))}</p>
      <div class="event-countdown-bar" aria-hidden="true"><span style="width:${progressPct(ms)}%"></span></div>
      ${opts.showSkip ? `<button type="button" class="btn ghost event-countdown-skip" data-countdown-skip>${esc(opts.skipLabel || "Countdown überspringen")}</button>` : ""}
      ${opts.showStart ? `<div class="event-countdown-actions">
        <button type="button" class="btn primary event-countdown-start" data-countdown-start>${esc(opts.startLabel || "Los geht's – jetzt starten")}</button>
        <button type="button" class="btn ghost event-countdown-continue" data-countdown-continue>${esc(opts.continueLabel || "Countdown läuft weiter")}</button>
      </div>` : ""}
    </div>
  `;
}

/** @deprecated Alias — bitte renderCountdownPanel verwenden. */
export function countdownHtml(meta, ms, opts = {}) {
  return renderCountdownPanel(meta, ms, opts);
}

function progressPct(ms) {
  /* Visuell: Anteil der letzten Stunde (oder voll bei länger). */
  const window = THRESH.hour;
  return Math.max(0, Math.min(100, (1 - Math.min(ms, window) / window) * 100));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;");
}

/**
 * Countdown-Overlay mounten und jede Sekunde aktualisieren.
 * @param {HTMLElement} host
 * @param {{ startTime?: string, title?: string, eventImage?: string }} meta
 * @param {{
 *   getSkew?: () => number,
 *   showSkip?: boolean,
 *   showStart?: boolean,
 *   skipLabel?: string,
 *   startLabel?: string,
 *   continueLabel?: string,
 *   onSkip?: () => void,
 *   onStart?: () => void,
 *   onContinue?: () => void,
 *   onEnded?: () => void,
 *   syncEveryMs?: number,
 *   onSync?: () => void,
 *   variant?: 'stage'|'presenter'|'home',
 *   showQr?: boolean,
 *   joinUrl?: string,
 *   locale?: string,
 *   timeZone?: string,
 *   t?: (key: string) => string,
 *   onQrCanvas?: (canvas: HTMLCanvasElement, url: string) => void,
 *   getMeta?: () => object,
 * }} [opts]
 * @returns {{ stop: () => void, refresh: () => void }}
 */
export function mountCountdown(host, meta, opts = {}) {
  let stopped = false;
  let endedFired = false;
  let timer = 0;
  let syncTimer = 0;
  const getSkew = opts.getSkew || (() => 0);
  const getMeta = opts.getMeta || (() => meta);

  const paint = () => {
    if (stopped || !host) return;
    const liveMeta = getMeta();
    const ms = remainingMs(liveMeta.startTime, getSkew());
    host.dataset.countdownStyle = sanitizeCountdownStyle(liveMeta.countdownStyle);
    host.dataset.stageEffect = sanitizeStageEffect(liveMeta.stageEffect);
    host.dataset.stageEffectIntensity = sanitizeStageEffectIntensity(liveMeta.stageEffectIntensity);
    const showQr = opts.showQr ?? Boolean(liveMeta.showStageQr);
    host.innerHTML = renderCountdownPanel(liveMeta, ms, {
      variant: opts.variant || "stage",
      showSkip: opts.showSkip,
      showStart: opts.showStart,
      skipLabel: opts.skipLabel,
      startLabel: opts.startLabel,
      continueLabel: opts.continueLabel,
      showQr,
      joinUrl: opts.joinUrl,
      locale: opts.locale,
      timeZone: opts.timeZone,
      t: opts.t,
    });
    host.hidden = false;
    host.classList.add("event-countdown-host");
    if (showQr && opts.joinUrl) {
      const canvas = host.querySelector(".event-countdown-qr-canvas");
      if (canvas instanceof HTMLCanvasElement) {
        opts.onQrCanvas?.(canvas, opts.joinUrl);
      }
    }
    host.querySelector("[data-countdown-skip]")?.addEventListener("click", () => {
      opts.onSkip?.();
    });
    host.querySelector("[data-countdown-start]")?.addEventListener("click", () => {
      opts.onStart?.();
    });
    host.querySelector("[data-countdown-continue]")?.addEventListener("click", () => {
      opts.onContinue?.();
    });
    if (ms <= 0 && !endedFired) {
      endedFired = true;
      host.classList.add("is-ending");
      window.setTimeout(() => {
        opts.onEnded?.();
      }, 800);
    }
  };

  paint();
  timer = window.setInterval(paint, 1000);
  const syncEvery = opts.syncEveryMs ?? 10_000;
  if (opts.onSync && syncEvery > 0) {
    syncTimer = window.setInterval(() => opts.onSync?.(), syncEvery);
  }

  return {
    refresh: paint,
    stop() {
      stopped = true;
      window.clearInterval(timer);
      window.clearInterval(syncTimer);
      if (host) {
        host.hidden = true;
        host.innerHTML = "";
        host.classList.remove("event-countdown-host", "is-ending");
      }
    },
  };
}

/**
 * Bilddatei skalieren und als Data-URL zurückgeben.
 * Max. Breite 4096 px, Qualitätsziel ≤ 2 MB.
 * @param {File} file
 * @returns {Promise<{ dataUrl: string, width: number, height: number, bytes: number, warning?: string }>}
 */
export function scaleEventImageFile(file) {
  return new Promise((resolve, reject) => {
    const maxBytes = 2 * 1024 * 1024;
    if (!file || !/^image\/(png|jpe?g|webp|svg\+xml)$/i.test(file.type)) {
      reject(new Error("Nur PNG, JPEG, WebP und SVG werden unterstützt."));
      return;
    }
    if (file.size > maxBytes * 1.5) {
      reject(new Error("Datei ist größer als 2 MB. Bitte komprimieren oder kleineres Bild wählen."));
      return;
    }
    /* SVG: unverändert als Data-URL (vektorbasiert). */
    if (/svg/i.test(file.type)) {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Grafik konnte nicht geladen werden."));
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (dataUrl.length > 3 * 1024 * 1024) {
          reject(new Error("Datei ist größer als 2 MB. Bitte komprimieren oder kleineres Bild wählen."));
          return;
        }
        if (/<\s*script|on\w+\s*=/i.test(dataUrl)) {
          reject(new Error("SVG enthält unzulässige Scripts."));
          return;
        }
        resolve({ dataUrl, width: 0, height: 0, bytes: file.size });
      };
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Grafik konnte nicht geladen werden."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Grafik konnte nicht geladen werden."));
      img.onload = () => {
        const maxW = 4096;
        let { width, height } = img;
        let warning = "";
        if (width < 1920 || height < 1080) {
          warning = "Auflösung unter 1920×1080 — auf großen Leinwänden ggf. unscharf.";
        }
        if (width > maxW) {
          height = Math.round((height * maxW) / width);
          width = maxW;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas nicht verfügbar."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const mime = /png/i.test(file.type) ? "image/png" : /webp/i.test(file.type) ? "image/webp" : "image/jpeg";
        let quality = 0.9;
        let dataUrl = canvas.toDataURL(mime, quality);
        /* Bei zu großer Data-URL Qualität senken (nicht bei PNG). */
        while (mime !== "image/png" && dataUrl.length > 2.8 * 1024 * 1024 && quality > 0.5) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL(mime, quality);
        }
        if (dataUrl.length > 3 * 1024 * 1024) {
          reject(new Error("Datei ist größer als 2 MB. Bitte komprimieren oder kleineres Bild wählen."));
          return;
        }
        const bytes = Math.round((dataUrl.length * 3) / 4);
        resolve({ dataUrl, width, height, bytes, warning });
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}
