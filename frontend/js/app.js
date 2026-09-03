/**
 * Pulse — Einstieg, Routing, Session-Orchestrierung, QR-Code, Theme.
 *
 * Öffentliche Folien-API ( palettiert für späteres Backend ):
 *   initPoll / updatePollResults / initWordCloud / updateWordCloud
 */

import { RealtimeClient, api } from "./websocket.js?v=nav20";
import { initPoll, updatePollResults, destroyPoll, initRatingScale, updateRatingResults, renderRatingInput } from "./poll.js";
import { initQA, updateQA, destroyQA } from "./qa.js";
import {
  mountQaTimer,
  applyQaTimerSnapshot,
  destroyQaTimer,
  isQaTimerEnabled,
  qaTimerLimitSec,
  currentQaTimerSnapshot,
} from "./qaTimerUi.js";
import { enterStage, leaveStage } from "./stage.js?v=nav19";
import {
  mountCountdown,
  shouldShowCountdown,
  remainingMs,
} from "./eventCountdown.js?v=nav1";
import { initQuiz, startQuizRound, setQuizRemaining, showQuizResults, destroyQuiz, applyFiftyFifty, showOverallLeaderboard } from "./quiz.js";
import { updateLeaderboard } from "./leaderboard.js";
import { initI18n, setLang, t, applyDom, currentLang, onLang } from "./i18n.js?v=nav13";
import { showEmergencyBanner, bindPanic, setPanicState } from "./emergency.js";
import { renderModeration } from "./moderation.js";
import { introQuiz, knowledgeCheck, icebreakerQuiz } from "./templates.js";
import { questionsToCsv, downloadText, printQuestionsPdf, simpleMarkdown } from "./export.js";
import { mountReactionBar, burstReaction } from "./reactions.js";
import { bindSslPage, showSslPage } from "./ssl.js?v=nav13";
import { bindHelp, showHelpPage, explainError } from "./help.js?v=help9";
import { bindPrivacyPages, fillLegalViews } from "./privacyPage.js?v=nav13";
import { bindSettingsPanel, refreshAuthSettingsPanel } from "./settings.js?v=nav30";
import { syncAdminNav } from "./adminNav.js?v=nav43";
import { loadAuth, applyAdminNavVisibility, getAuthUser, isAuthEnabled, hasAdminAccess, isAuthLoaded, logout } from "./authClient.js?v=nav47";
import { showLoginPage } from "./loginPage.js?v=nav47";
import { showAdminLoginModal, isAdminLoginModalOpen, rememberAdminRedirect } from "./adminLoginModal.js?v=nav47";
import { showUsersPage } from "./usersAdmin.js?v=nav43";
import { showTeamsPage } from "./teamsPage.js?v=nav43";
import { showProfilePage } from "./profilePage.js?v=nav30";
import { ensureStepUp } from "./stepUp.js?v=nav47";
import { bindEvents, showEventsPage, scheduleLoadHomeEvents, cancelHomeEventsWork, isEventsHash, isLegacyEventJoinHash, redirectLegacyEventJoin } from "./events.js?v=nav54";
import { drawQrCode, joinUrlFromLocation, absorbPathJoinRoute } from "./qrRender.js?v=nav48";
import {
  initTheme,
  toggleDocumentTheme,
  applyBrandingContrast,
  applyCustomFont,
  applySlideBackground,
} from "./theme.js";
import {
  addDraft,
  removeDraft,
  moveDraft,
  clearDraft,
  slidesForStart,
  renderDraftList,
  renderPresentStrip,
  applyMockDeck,
} from "./deck.js";
import {
  mountPresenterStats,
  refreshPresenterStats,
  syncRehearsalUi,
  syncOfflineBanner,
  stripPresenterSecrets,
  destroyPresenterStats,
} from "./presenterStats.js";
import { bindJoinGestures, hapticSuccess } from "./joinMobile.js";
import { bindPresentMobileUi } from "./presentMobile.js?v=nav54";
import { bindInteractionBar, joinInputsBlocked, joinStatusMessage, computeRemainingMs, formatCountdown, resetJoinTimerAnnouncements, tickJoinTimerA11y, applyJoinTimerUrgency, joinTimerTypeHint } from "./interactionPresenter.js?v=nav55";
import { bindAdminMobileNav, bindPublicMobileMenu } from "./mobileNav.js?v=nav54";
import {
  renderRankingInput,
  renderPointsInput,
  renderOpenTextInput,
  renderImageChoiceInput,
  renderDatetimeInput,
  destroySlideInput,
} from "./slideInputs.js";
import { renderTypedResults } from "./slideResults.js";
import {
  OPTION_SLIDE_TYPES,
  maxOptionsForType,
  minOptionsForType,
  showsOptionsSection,
  showsTypeOptionsSection,
  toggleSection,
  confirmTypeChange,
} from "./slideForm.js";
import { renderPickerInput, defaultPickerOptions } from "./picker.js";
import {
  mountCategoryEditor,
  collectCategoriesFromHost,
  optionCategorySelectHtml,
  refreshPickerPreview,
} from "./pickerEditor.js";

const LOCAL_SESSION_PREFIX = "pulse:session:";
const SOUND_MUTE_KEY = "pulse:sound-muted";

/** Wortwolken-Modul erst laden, wenn eine Wortwolken-Folie aktiv ist. */
let wordcloudMod = null;
let wordcloudGen = 0;

async function ensureWordCloud() {
  if (!wordcloudMod) wordcloudMod = await import("./wordcloud.js");
  return wordcloudMod;
}

function destroyWordCloud() {
  wordcloudMod?.destroyWordCloud();
}

function updateWordCloud(entries) {
  wordcloudMod?.updateWordCloud(entries);
}
const ADMIN_KEY_PREFIX = "pulse:admin:";
const RECENT_KEY = "pulse:recent";
/** Merkt sich den letzten Folientyp für Wechsel-Warnung. */
let lastCreateType = "choice";
/** Kategorie-Editor-Instanz auf der Startseite. */
let createCategoryEditor = null;
let createPreviewTimer = 0;

const els = {
  views: {
    home: document.getElementById("view-home"),
    /* Hub #/admin — nicht mit branding / adminPrivacy verwechseln. */
    adminHub: document.getElementById("view-admin"),
    present: document.getElementById("view-present"),
    join: document.getElementById("view-join"),
    privacy: document.getElementById("view-privacy"),
    impressum: document.getElementById("view-impressum"),
    branding: document.getElementById("view-branding"),
    ssl: document.getElementById("view-ssl"),
    adminPrivacy: document.getElementById("view-admin-privacy"),
    adminSettings: document.getElementById("view-settings"),
    updates: document.getElementById("view-updates"),
    backups: document.getElementById("view-backups"),
    onboarding: document.getElementById("view-onboarding"),
    teams: document.getElementById("view-teams"),
    help: document.getElementById("view-help"),
    stage: document.getElementById("view-stage"),
    events: document.getElementById("view-events"),
  },
  createForm: document.getElementById("create-form"),
  createType: document.getElementById("create-type"),
  createQuestion: document.getElementById("create-question"),
  createOptions: document.getElementById("create-options"),
  optionFields: document.getElementById("option-fields"),
  addOption: document.getElementById("add-option"),
  btnDemo: document.getElementById("btn-demo"),
  joinForm: document.getElementById("join-form"),
  joinCodeInput: document.getElementById("join-code-input"),
  presentQuestion: document.getElementById("present-question"),
  participantCount: document.getElementById("participant-count"),
  connectionStatus: document.getElementById("connection-status"),
  pollRoot: document.getElementById("poll-root"),
  wordcloudRoot: document.getElementById("wordcloud-root"),
  wordcloudCanvas: document.getElementById("wordcloud-canvas"),
  wordList: document.getElementById("word-virtual-list"),
  qaRoot: document.getElementById("qa-root"),
  quizRoot: document.getElementById("quiz-root"),
  joinQa: document.getElementById("join-qa"),
  joinQuiz: document.getElementById("join-quiz"),
  joinRating: document.getElementById("join-rating"),
  joinExtra: document.getElementById("join-extra"),
  createQuizExtra: document.getElementById("create-quiz-extra"),
  createRatingExtra: document.getElementById("create-rating-extra"),
  createCorrect: document.getElementById("create-correct"),
  createDuration: document.getElementById("create-duration"),
  qrCanvas: document.getElementById("qr-canvas"),
  joinCodeDisplay: document.getElementById("join-code-display"),
  joinUrl: document.getElementById("join-url"),
  slideIndicator: document.getElementById("slide-indicator"),
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  btnReset: document.getElementById("btn-reset"),
  btnTheme: document.getElementById("btn-theme"),
  btnThemeJoin: document.getElementById("btn-theme-join"),
  btnThemeHome: document.getElementById("btn-theme-home"),
  btnThemeAdmin: document.getElementById("btn-theme-admin"),
  joinSessionCode: document.getElementById("join-session-code"),
  joinQuestion: document.getElementById("join-question"),
  joinChoice: document.getElementById("join-choice"),
  joinWordForm: document.getElementById("join-word-form"),
  wordInput: document.getElementById("word-input"),
  joinFeedback: document.getElementById("join-feedback"),
  adminDialog: document.getElementById("admin-dialog"),
  adminForm: document.getElementById("admin-form"),
  adminKeyInput: document.getElementById("admin-key-input"),
  adminCancel: document.getElementById("admin-cancel"),
  panicButton: document.getElementById("panic-button"),
  moderationPanel: document.getElementById("moderation-panel"),
  btnModeration: document.getElementById("btn-moderation"),
  deckDraft: document.getElementById("deck-draft"),
  deckEditor: document.getElementById("deck-editor"),
  btnDeckAdd: document.getElementById("btn-deck-add"),
  presentDeck: document.getElementById("present-deck"),
  btnSlideDup: document.getElementById("btn-slide-dup"),
  btnSlideDel: document.getElementById("btn-slide-del"),
  slideDialog: document.getElementById("slide-dialog"),
  slideAddForm: document.getElementById("slide-add-form"),
  lobbyOverlay: document.getElementById("lobby-overlay"),
  resultsTeaser: document.getElementById("results-teaser"),
  btnResults: document.getElementById("btn-results"),
  btnCopyLink: document.getElementById("btn-copy-link"),
  btnLobbyStart: document.getElementById("btn-lobby-start"),
  joinLobby: document.getElementById("join-lobby"),
  joinReactions: document.getElementById("join-reactions"),
  presentStage: document.getElementById("present-stage"),
  presentInteractionBar: document.getElementById("present-interaction-bar"),
  presenterStats: document.getElementById("presenter-stats"),
  presentOfflineBanner: document.getElementById("present-offline-banner"),
  joinOfflineBanner: document.getElementById("join-offline-banner"),
  rehearsalBanner: document.getElementById("rehearsal-banner"),
  joinRehearsalHint: document.getElementById("join-rehearsal-hint"),
  createRehearsal: document.getElementById("create-rehearsal"),
  createPlanned: document.getElementById("create-planned"),
  createNotes: document.getElementById("create-notes"),
  joinMain: document.getElementById("join-main"),
  joinConnectionStatus: document.getElementById("join-connection-status"),
};

/** Interaktionsleiste Presenter (Start/Pause/Ende). */
let interactionBarCtrl = null;
/** Lokaler Timer-Tick für Countdown-Darstellung. */
let interactionTickTimer = null;

/** @type {{ session: any, role: string, rt: RealtimeClient | null, sim: number }} */
const ctx = {
  session: null,
  role: "home",
  rt: null,
  sim: 0,
  votedSlide: new Set(),
  /** Folien-ID mit ausstehender Stimme (Live-WS), bis poll:update oder Fehler. */
  pendingVoteSlideId: null,
  /** Folien-IDs, für die der Q&A-Timer in dieser Presenter-Session schon auto-gestartet wurde. */
  qaAutoStarted: new Set(),
  instanceBranding: null,
  /** Event-Countdown (Presenter): übersprungen bis Session-Wechsel. */
  eventCountdownSkipped: false,
  eventClockSkew: 0,
};

/** @type {{ stop: () => void, refresh?: () => void } | null} */
let presentCountdownCtl = null;

/* Darstellung: localStorage-Key „pulse-theme“, Light-Default — siehe theme.js. */
initTheme();
ensureClientId();
/* Hash-Routing zuerst: Impressum/Datenschutz/Admin dürfen nicht an einem Boot-Fehler scheitern. */
window.addEventListener("hashchange", route);
try {
  initHomeForm();
  bindGlobal();
} catch (err) {
  console.error("[boot]", err);
}

/**
 * Auth vor dem ersten route() laden — bei geschützter Admin-URL Login-Modal zeigen.
 */
(async function pulseBoot() {
  try {
    absorbPathJoinRoute();
    await loadAuth();
    const hash = location.hash.replace(/^#/, "") || "/";
    const needsAuth =
      isAuthEnabled() && hash.startsWith("/admin") && hash !== "/admin/login" && !hasAdminAccess();
    if (needsAuth) {
      rememberAdminRedirect(hash);
      navigate("/admin/login");
      return;
    } else {
      route();
    }
  } catch (err) {
    console.error("[route]", err);
    document.documentElement.classList.remove("route-booting");
    showView("home");
  }
  bootUi();
})();

async function bootUi() {
  let branding;
  try {
    branding = (await api.getBranding())?.branding;
    ctx.branding = branding;
    ctx.instanceBranding = branding || ctx.instanceBranding;
    applyBranding(branding);
  } catch (err) {
    console.error("[boot-branding]", err);
  }
  await initI18n(branding?.languages);
  renderLangSwitch();
  applyDom();
  applyBranding(ctx.branding || branding);
  onLang(() => {
    applyBranding(ctx.branding);
    syncSoundToggles();
  });
  refreshDraftList();
  renderRecentSessions();
  mountReactionBar(els.joinReactions, sendReaction);
  showConsentIfNeeded();
  bindBrandingForm(branding);
  bindSettingsPanel({
    applyBranding,
    fillLegalViews,
    renderLangSwitch,
  });
  bindSslPage();
  bindPrivacyPages();
  bindHelp();
  bindPresentMobileUi();
  interactionBarCtrl = bindInteractionBar({
    bar: els.presentInteractionBar,
    emitLive,
    getSlide: currentSlide,
  });
  bindAdminMobileNav();
  bindPublicMobileMenu();
  bindEvents({
    drawQrCode,
    joinUrl,
    formatCode,
  });
  /* Nach i18n die aktuelle Admin-Seite neu zeichnen (SSL-Meta nutzt t()).
     Events: nur nachziehen, wenn route() den ersten Lauf noch nicht fertig gemalt hat
     (Race zwischen sync route() und async bootUi). */
  if (expectedViewFromHash() === "ssl") {
    await showSslPage();
    return;
  }
  if (expectedViewFromHash() === "events") {
    const painted = document.getElementById("events-root")?.dataset?.eventsPainted;
    if (!painted) await showEventsPage();
    return;
  }
  if (expectedViewFromHash() === "home") {
    const box = document.getElementById("home-events");
    if (!box?.dataset.eventsReady) scheduleLoadHomeEvents();
  }
  applyAdminNavVisibility();
  document.getElementById("btn-auth-logout")?.toggleAttribute("hidden", !getAuthUser());
  /* Neues Fenster (#/stage/…) setzt den Hash manchmal erst nach dem ersten route(). */
  if (expectedViewFromHash() !== ctx.role) {
    route();
    return;
  }
  if (ctx.role === "present" && ctx.session) {
    renderPresenterChrome();
    refreshPresenterPanel();
  } else if (ctx.role === "join" && ctx.session) {
    renderJoinSlide();
  }
}

/** Welche View der aktuelle Hash verlangt — zum Abgleich nach asynchronem Boot. */
function expectedViewFromHash() {
  const hash = location.hash.replace(/^#/, "") || "/";
  if (hash === "/privacy") return "privacy";
  if (hash === "/impressum") return "impressum";
  if (hash === "/admin/privacy") return "adminPrivacy";
  if (hash === "/admin/branding") return "branding";
  if (hash === "/admin/ssl") return "ssl";
  if (hash === "/admin/email") return "email";
  if (hash === "/admin/settings") return "adminSettings";
  if (hash === "/admin/updates") return "updates";
  if (hash === "/admin/backups") return "backups";
  if (hash === "/admin/onboarding") return "onboarding";
  if (hash === "/admin/login") return "login";
  if (hash === "/admin/users") return "users";
  if (hash === "/admin/teams") return "teams";
  if (hash === "/admin/profile") return "profile";
  if (isLegacyEventJoinHash(hash)) return "join";
  if (isEventsHash(hash)) return "events";
  if (/^\/(?:admin\/)?help/.test(hash)) return "help";
  /* Exakter Hub — nach den Suffix-Routen, damit /admin/branding nicht hier landet. */
  if (hash === "/admin" || hash === "/admin/") return "adminHub";
  if (/^\/(?:stage|present-view)\/\d{6}/.test(hash)) return "stage";
  if (/^\/join/.test(hash)) return "join";
  if (/^\/present/.test(hash)) return "present";
  return "home";
}

function bindGlobal() {
  els.btnTheme?.addEventListener("click", toggleTheme);
  els.btnThemeJoin?.addEventListener("click", toggleTheme);
  els.btnThemeHome?.addEventListener("click", toggleTheme);
  els.btnThemeAdmin?.addEventListener("click", toggleTheme);
  document.getElementById("btn-sound")?.addEventListener("click", toggleSoundMute);
  document.getElementById("btn-sound-join")?.addEventListener("click", toggleSoundMute);
  syncSoundToggles();
  els.btnPrev?.addEventListener("click", () => shiftSlide(-1));
  els.btnNext?.addEventListener("click", () => shiftSlide(1));
  els.btnReset?.addEventListener("click", resetResults);
  els.createForm?.addEventListener("submit", onCreate);
  els.btnDemo?.addEventListener("click", () => startSession(demoPayload()));
  document.getElementById("btn-rehearsal")?.addEventListener("click", () => {
    if (els.createRehearsal) els.createRehearsal.checked = true;
    els.createForm?.requestSubmit();
  });
  bindJoinGestures(els.joinMain);
  document.getElementById("btn-intro-quiz")?.addEventListener("click", () => startSession(introQuiz()));
  document.getElementById("btn-knowledge")?.addEventListener("click", () => startSession(knowledgeCheck()));
  document.getElementById("btn-icebreaker")?.addEventListener("click", () => startSession(icebreakerQuiz()));
  document.getElementById("btn-export-csv")?.addEventListener("click", exportQaCsv);
  document.getElementById("btn-export-pdf")?.addEventListener("click", exportQaPdf);
  els.joinForm?.addEventListener("submit", onJoinSubmit);
  els.joinWordForm?.addEventListener("submit", onWordSubmit);
  els.createType?.addEventListener("change", onCreateTypeChange);
  els.addOption?.addEventListener("click", () => addOptionField());
  document.getElementById("btn-picker-bulk")?.addEventListener("click", applyPickerBulkImport);
  document.getElementById("create-picker-multi")?.addEventListener("change", syncPickerMultiUi);
  document.getElementById("create-picker-categories")?.addEventListener("change", syncPickerCategoriesUi);
  document.getElementById("btn-add-category")?.addEventListener("click", () => {
    createCategoryEditor?.addCategory();
    syncPickerCategoriesUi();
  });
  document.getElementById("create-picker-layout")?.addEventListener("change", scheduleCreatePickerPreview);
  document.getElementById("create-picker-search")?.addEventListener("change", scheduleCreatePickerPreview);
  els.adminForm?.addEventListener("submit", onAdminUnlock);
  els.adminCancel?.addEventListener("click", () => els.adminDialog?.close());
  document.getElementById("btn-auth-logout")?.addEventListener("click", async () => {
    await logout();
    location.hash = "#/";
    route("/");
  });
  document.addEventListener("keydown", onHotkeys);
  bindPanic(els.panicButton, {
    onPanic: () => emitLive("emergency", { code: ctx.session?.code, action: "activate" }),
    onResume: () => emitLive("emergency", { code: ctx.session?.code, action: "resume" }),
  });
  els.btnModeration?.addEventListener("click", toggleModeration);
  els.btnDeckAdd?.addEventListener("click", onAddDraftSlide);
  els.btnSlideDup?.addEventListener("click", () => emitDeck("duplicate", { id: currentSlide()?.id }));
  els.btnSlideDel?.addEventListener("click", () => emitDeck("remove", { id: currentSlide()?.id }));
  els.btnResults?.addEventListener("click", toggleResults);
  document.getElementById("btn-stage-view")?.addEventListener("click", openStageWindow);
  els.btnCopyLink?.addEventListener("click", copyJoinLink);
  els.btnLobbyStart?.addEventListener("click", () => setLobby(false));
  els.slideAddForm?.addEventListener("submit", onAddLiveSlide);
  document.getElementById("slide-add-cancel")?.addEventListener("click", () => els.slideDialog?.close());
  document.getElementById("slide-add-type")?.addEventListener("change", syncSlideAddOptions);
  document.getElementById("add-datetime")?.addEventListener("click", () => addDatetimeField());
  /* Capture: Hash-Links sofort routen, auch wenn ein Overlay das Bubble verhindert. */
  document.addEventListener("click", onInAppHashClick, true);
  document.getElementById("btn-admin-home")?.addEventListener("click", onAdminHomeClick);
  document.getElementById("consent-ok")?.addEventListener("click", acceptConsent);
  document.getElementById("footer-toggle")?.addEventListener("click", () => {
    document.getElementById("app-footer")?.classList.toggle("is-open");
  });
}

/** Nach erfolgreichem Admin-Login zur gespeicherten Route navigieren. */
function afterAdminLogin(result, fallbackPath) {
  if (!result?.ok) return;
  const path = String(result.redirectHash || fallbackPath || "/admin").replace(/^#/, "");
  navigate(path.startsWith("/") ? path : `/${path}`);
}

/** Admin-Hash zurücksetzen ohne erneuten Guard (replaceState). */
function revertAdminHash() {
  try {
    history.replaceState(null, "", "#/");
  } catch {
    try {
      location.replace("#/");
    } catch {
      /* Webview ohne Hash */
    }
  }
}

function route(forcedHash) {
  /* hashchange liefert ein Event — nur echte Strings (z. B. "/admin") gelten als Vorgabe. */
  const override = typeof forcedHash === "string" ? forcedHash.replace(/^#/, "") : "";
  const hash = override || location.hash.replace(/^#/, "") || "/";

  if (hash === "/admin/login") {
    teardownRealtime();
    showView("login");
    showLoginPage();
    return;
  }

  if (hash === "/admin/onboarding") {
    teardownRealtime();
    showView("onboarding", hash);
    import("./onboardingPage.js?v=nav45")
      .then((m) => m.showOnboardingPage())
      .catch((err) => console.error("[onboarding-page]", err));
    return;
  }

  if (isAuthEnabled() && hash.startsWith("/admin") && hash !== "/admin/login" && hash !== "/admin/onboarding" && !hasAdminAccess()) {
    if (isAdminLoginModalOpen()) return;
    rememberAdminRedirect(hash);
    navigate("/admin/login");
    return;
  }

  if (hash === "/admin/users") {
    teardownRealtime();
    showView("users", hash);
    void showUsersPage().then(() => applyAdminNavVisibility());
    return;
  }

  if (hash === "/admin/teams") {
    teardownRealtime();
    showView("teams", hash);
    void showTeamsPage().then(() => applyAdminNavVisibility());
    return;
  }

  if (hash === "/admin/profile") {
    teardownRealtime();
    showView("profile");
    showProfilePage();
    applyAdminNavVisibility();
    return;
  }

  if (hash === "/privacy") {
    teardownRealtime();
    showView("privacy");
    fillLegalViews("privacy");
    return;
  }
  if (hash === "/impressum") {
    teardownRealtime();
    showView("impressum");
    fillLegalViews("impressum");
    return;
  }
  /* Rechtstexte getrennt von Branding, damit Theme-Arbeit an #/admin/branding nicht kollidiert. */
  if (hash === "/admin/privacy") {
    teardownRealtime();
    showView("adminPrivacy");
    fillLegalViews();
    return;
  }
  if (hash === "/admin/branding") {
    teardownRealtime();
    showView("branding");
    applyDom(els.views.branding || document.getElementById("view-branding"));
    return;
  }
  if (hash === "/admin/ssl") {
    teardownRealtime();
    showView("ssl");
    showSslPage();
    return;
  }
  if (hash === "/admin/email") {
    teardownRealtime();
    showView("email");
    import("./emailPage.js?v=nav36")
      .then((m) => m.showEmailPage())
      .catch((err) => {
        console.error("[email-page]", err);
      });
    return;
  }
  if (hash === "/admin/settings") {
    teardownRealtime();
    showView("adminSettings");
    applyDom(els.views.adminSettings || document.getElementById("view-settings"));
    refreshAuthSettingsPanel();
    return;
  }
  if (hash === "/admin/updates") {
    teardownRealtime();
    showView("updates");
    import("./updatesPage.js?v=nav44")
      .then((m) => m.showUpdatesPage())
      .catch((err) => {
        console.error("[updates-page]", err);
        const msg = document.getElementById("update-msg");
        if (msg) msg.textContent = "Updates-Modul konnte nicht geladen werden — bitte Seite neu laden (Strg+F5).";
      });
    return;
  }
  if (hash === "/admin/backups") {
    teardownRealtime();
    showView("backups", hash);
    import("./backupsPage.js?v=nav47")
      .then((m) => m.showBackupsPage())
      .catch((err) => {
        console.error("[backups-page]", err);
        const msg = document.getElementById("backup-msg");
        if (msg) msg.textContent = "Backups-Modul konnte nicht geladen werden — bitte Seite neu laden (Strg+F5).";
      });
    return;
  }
  if (isLegacyEventJoinHash(hash)) {
    teardownRealtime();
    const id = hash.match(/^\/event\/([^/]+)/)?.[1];
    redirectLegacyEventJoin(id ? decodeURIComponent(id) : "");
    return;
  }
  if (isEventsHash(hash)) {
    teardownRealtime();
    if (!els.views.events) els.views.events = document.getElementById("view-events");
    showView("events", hash);
    showEventsPage();
    return;
  }
  const helpMatch = hash.match(/^\/(?:admin\/)?help(?:\/([a-z0-9-]+))?$/);
  if (helpMatch) {
    teardownRealtime();
    if (!els.views.help) els.views.help = document.getElementById("view-help");
    showView("help");
    showHelpPage({ admin: hash.startsWith("/admin/") });
    return;
  }
  /* Hub exakt /admin — nach /admin/branding, /admin/ssl, /admin/privacy und Hilfe. */
  if (hash === "/admin" || hash === "/admin/") {
    teardownRealtime();
    if (!els.views.adminHub) els.views.adminHub = document.getElementById("view-admin");
    showView("adminHub");
    try {
      renderRecentSessions();
    } catch (err) {
      console.error("[admin-hub]", err);
    }
    return;
  }
  if (hash === "/qa" || hash === "/quiz") {
    sessionStorage.setItem("pulse:start-type", hash.slice(1));
    startSession(demoPayload());
    return;
  }
  if (hash === "/intro-quiz") {
    startSession(introQuiz());
    return;
  }
  if (hash === "/knowledge-quiz") {
    startSession(knowledgeCheck());
    return;
  }
  const join = hash.match(/^\/join\/?(\d{6})?/);
  const present = hash.match(/^\/present\/?(\d{6})?/);
  /* Explizit sechs Stellen, damit /present nicht mit present-view kollidiert
     und ein neues Fenster mit Hash zuverlässig die Leinwand öffnet. */
  const stage = hash.match(/^\/(?:stage|present-view)\/(\d{6})\/?$/);

  if (stage) {
    teardownRealtime();
    showView("stage");
    enterStage(stage[1]);
    return;
  }
  leaveStage();

  if (join) {
    showView("join");
    enterJoin(join[1] || els.joinCodeInput.value);
    return;
  }
  if (present) {
    showView("present");
    enterPresent(present[1]);
    return;
  }
  teardownRealtime();
  showView("home");
}

function showView(name, routeHash) {
  document.documentElement.classList.remove("route-booting");
  document.body.classList.toggle("stage-mode", name === "stage");
  if (!els.views.adminHub) els.views.adminHub = document.getElementById("view-admin");
  if (!els.views.privacy) els.views.privacy = document.getElementById("view-privacy");
  if (!els.views.impressum) els.views.impressum = document.getElementById("view-impressum");
  if (!els.views.help) els.views.help = document.getElementById("view-help");
  if (!els.views.adminSettings) els.views.adminSettings = document.getElementById("view-settings");
  if (!els.views.events) els.views.events = document.getElementById("view-events");
  if (!els.views.login) els.views.login = document.getElementById("view-login");
  if (!els.views.users) els.views.users = document.getElementById("view-users");
  if (!els.views.teams) els.views.teams = document.getElementById("view-teams");
  if (!els.views.profile) els.views.profile = document.getElementById("view-profile");
  if (!els.views.updates) els.views.updates = document.getElementById("view-updates");
  if (!els.views.email) els.views.email = document.getElementById("view-email");
  if (!els.views.backups) els.views.backups = document.getElementById("view-backups");
  if (!els.views.onboarding) els.views.onboarding = document.getElementById("view-onboarding");
  for (const [key, el] of Object.entries(els.views)) {
    if (!el) continue;
    const active = key === name;
    el.hidden = !active;
    el.inert = !active;
  }
  ctx.role = name;
  const hashForNav =
    routeHash ?? (typeof location.hash === "string" ? location.hash.replace(/^#/, "") || "/" : "/");
  syncAdminNav(name, hashForNav);
  applyAdminNavVisibility();
  document.getElementById("btn-auth-logout")?.toggleAttribute("hidden", !getAuthUser());
  const label = document.getElementById("admin-user-label");
  const u = getAuthUser();
  if (label) {
    if (u) {
      label.hidden = false;
      label.replaceChildren();
      const link = document.createElement("a");
      link.href = "#/admin/profile";
      link.className = "admin-user-link";
      link.textContent = `${u.displayName} (${u.roleLabel || u.role})`;
      label.append(link);
    } else {
      label.hidden = true;
      label.textContent = "";
    }
  }
  if (name === "home") {
    applyBranding(ctx.instanceBranding || ctx.branding);
    scheduleLoadHomeEvents();
  } else {
    cancelHomeEventsWork();
  }
  if (name !== "home") {
    const consent = document.getElementById("consent-dialog");
    if (consent) consent.hidden = true;
  }
}

/** Administration von der Startseite — Modal sofort (Firefox-User-Geste), Event-Laden abbrechen. */
function onAdminHomeClick(ev) {
  ev.preventDefault();
  cancelHomeEventsWork();
  void openAdminFromHome("/admin");
}

/**
 * Admin-Einstieg von der Startseite: bei fehlender Session Modal in der Klick-Geste öffnen.
 * @param {string} path z. B. "/admin"
 */
async function openAdminFromHome(path) {
  if (!isAuthLoaded()) await loadAuth();
  if (!isAuthEnabled() || hasAdminAccess()) {
    navigate(path);
    return;
  }
  const result = await showAdminLoginModal(path);
  afterAdminLogin(result, path);
}

/**
 * Interne Hash-Routen (#/privacy, #/impressum, #/admin, …) per JS umschalten.
 * Reines href="#/…" setzt in manchen Webviews keinen hashchange.
 */
function onInAppHashClick(ev) {
  const a = ev.target?.closest?.("a[href]");
  if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
  if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const href = (a.getAttribute("href") || "").trim();
  if (!href.startsWith("#/")) return;
  ev.preventDefault();
  const path = href.slice(1);
  if (path.startsWith("/admin") && path !== "/admin/login") {
    cancelHomeEventsWork();
    void openAdminFromHome(path);
    return;
  }
  navigate(path);
}

/**
 * Hash setzen (wenn möglich) und View sofort über route() wechseln.
 * @param {string} path z. B. "/privacy" oder "#/impressum"
 */
function navigate(path) {
  const clean = String(path || "/").replace(/^#/, "") || "/";
  const hash = clean.startsWith("/") ? `#${clean}` : `#/${clean}`;
  try {
    if (location.hash !== hash) location.hash = hash;
  } catch {
    /* Webview ohne Hash — View trotzdem wechseln. */
  }
  route(clean.startsWith("/") ? clean : `/${clean}`);
}

function initHomeForm() {
  if (!els.optionFields) return;
  els.optionFields.innerHTML = "";
  addOptionField("Option A");
  addOptionField("Option B");
  lastCreateType = els.createType?.value || "choice";
  syncOptionEditor();
  refreshDraftList();
}

/** Folientyp-Wechsel mit Bestätigung und Reset der Optionsliste. */
function onCreateTypeChange() {
  const next = els.createType.value;
  if (!confirmTypeChange(lastCreateType, next)) {
    els.createType.value = lastCreateType;
    return;
  }
  lastCreateType = next;
  if (next !== "picker") {
    createCategoryEditor = null;
    document.getElementById("create-category-fields")?.replaceChildren();
  }
  if (next === "picker") resetOptionFields(defaultPickerOptions());
  else if (OPTION_SLIDE_TYPES.has(next) && els.optionFields.children.length < minOptionsForType(next)) {
    resetOptionFields(defaultOptions());
  }
  syncOptionEditor();
}

function resetOptionFields(options) {
  els.optionFields.innerHTML = "";
  options.forEach((o) => addOptionField(o.label || o.text || "", false));
}

function addOptionField(value = "", runSync = true) {
  const type = els.createType.value;
  const max = maxOptionsForType(type);
  if (els.optionFields.children.length >= max) return;
  const row = document.createElement("div");
  row.className = "option-row";
  row.innerHTML = `<input maxlength="${type === "picker" ? 100 : 42}" placeholder="Antwort" /><span class="picker-opt-cat-slot"></span><input type="file" accept="image/png,image/jpeg,image/webp" hidden class="opt-image" /><button type="button" class="btn ghost opt-img-btn" hidden>Bild</button><button type="button" class="btn ghost" aria-label="Entfernen">✕</button>`;
  row.querySelector("input").value = value;
  const file = row.querySelector(".opt-image");
  const imgBtn = row.querySelector(".opt-img-btn");
  imgBtn.addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    const f = file.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      row.dataset.image = String(reader.result || "");
      imgBtn.textContent = "Bild ✓";
    };
    reader.readAsDataURL(f);
  });
  row.querySelector("button[aria-label]").addEventListener("click", () => {
    const min = minOptionsForType(type);
    if (els.optionFields.children.length <= min) return;
    row.remove();
    syncOptionEditor();
  });
  els.optionFields.append(row);
  syncPickerOptionCategorySelects();
  if (runSync) syncOptionEditor();
}

/** Kategorie-Dropdowns an Optionszeilen (nur Picker + aktive Kategorien). */
function syncPickerOptionCategorySelects() {
  const type = els.createType?.value;
  const useCats = Boolean(document.getElementById("create-picker-categories")?.checked);
  const cats = useCats ? collectCategoriesFromHost(document.getElementById("create-category-fields")) : [];
  [...els.optionFields.querySelectorAll(".option-row")].forEach((row, i) => {
    const slot = row.querySelector(".picker-opt-cat-slot");
    if (!slot) return;
    if (type !== "picker" || !cats.length) {
      slot.innerHTML = "";
      slot.hidden = true;
      return;
    }
    slot.hidden = false;
    const prev = row.dataset.category || "";
    slot.innerHTML = optionCategorySelectHtml(cats, prev, i);
    slot.querySelector("select")?.addEventListener("change", (ev) => {
      row.dataset.category = ev.target.value;
      scheduleCreatePickerPreview();
    });
  });
}

function syncPickerCategoriesUi() {
  const on = Boolean(document.getElementById("create-picker-categories")?.checked);
  const wrap = document.getElementById("create-categories-wrap");
  const preview = document.getElementById("create-picker-preview");
  if (wrap) wrap.hidden = !on;
  if (preview) preview.hidden = els.createType?.value !== "picker";
  const host = document.getElementById("create-category-fields");
  if (on && host && !createCategoryEditor) {
    createCategoryEditor = mountCategoryEditor(host, [], {
      t,
      onChange: () => {
        syncPickerOptionCategorySelects();
        scheduleCreatePickerPreview();
      },
    });
  }
  if (on && createCategoryEditor && host && !host.children.length) {
    createCategoryEditor.addCategory();
    createCategoryEditor.addCategory();
  }
  syncPickerOptionCategorySelects();
  scheduleCreatePickerPreview();
}

/** Live-Vorschau der Picker-Folie im Create-Formular (debounced). */
function scheduleCreatePickerPreview() {
  clearTimeout(createPreviewTimer);
  createPreviewTimer = setTimeout(refreshCreatePickerPreview, 280);
}

function refreshCreatePickerPreview() {
  const host = document.getElementById("create-picker-preview");
  if (!host || els.createType?.value !== "picker") {
    host?.replaceChildren();
    if (host) host.hidden = true;
    return;
  }
  host.hidden = false;
  try {
    const slide = readFormSlide();
    refreshPickerPreview(host, slide, { t });
  } catch {
    host.replaceChildren();
  }
}

/** CSV-/Zeilenliste in Picker-Optionen übernehmen (max. 50). */
function applyPickerBulkImport() {
  const raw = document.getElementById("create-picker-bulk-text")?.value || "";
  const lines = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
  if (lines.length < 10) {
    window.alert("Mindestens 10 Optionen für Picker erforderlich.");
    return;
  }
  resetOptionFields(lines.map((label, i) => ({ id: `o${i + 1}`, label })));
  syncOptionEditor();
}

function syncPickerMultiUi() {
  const on = Boolean(document.getElementById("create-picker-multi")?.checked);
  const wrap = document.getElementById("create-picker-max-wrap");
  if (wrap) wrap.hidden = !on;
}

function syncOptionEditor() {
  const type = els.createType.value;
  const needsOpts = showsOptionsSection(type);
  const optsSection = document.getElementById("create-options-section");
  const typeOptsSection = document.getElementById("create-type-options-section");
  const optsLabel = document.getElementById("create-options-label");
  const pickerBulk = document.getElementById("create-picker-bulk");

  toggleSection(optsSection, needsOpts);
  toggleSection(typeOptsSection, showsTypeOptionsSection(type) && type !== "demo");

  if (optsLabel) {
    optsLabel.textContent =
      type === "picker"
        ? t("picker.optionsRange") || "Optionen (10–50)"
        : t("home.options") || "Antworten (2–6)";
  }
  if (pickerBulk) pickerBulk.hidden = type !== "picker";
  if (els.addOption) {
    els.addOption.hidden = !needsOpts;
    els.addOption.disabled = els.optionFields.children.length >= maxOptionsForType(type);
  }

  document.getElementById("create-choice-extra")?.toggleAttribute("hidden", type !== "choice");
  els.createQuizExtra.hidden = type !== "quiz";
  if (els.createRatingExtra) els.createRatingExtra.hidden = type !== "rating_scale";
  const dt = document.getElementById("create-datetime-extra");
  if (dt) dt.hidden = type !== "datetime";
  const imgHint = document.getElementById("create-image-extra");
  if (imgHint) imgHint.hidden = type !== "image_choice";
  document.getElementById("create-wordcloud-extra")?.toggleAttribute("hidden", type !== "wordcloud");
  document.getElementById("create-qa-extra")?.toggleAttribute("hidden", type !== "qa");
  document.getElementById("create-picker-extra")?.toggleAttribute("hidden", type !== "picker");

  els.optionFields.querySelectorAll(".opt-img-btn").forEach((b) => {
    b.hidden = type !== "image_choice";
  });
  if (els.deckEditor) els.deckEditor.hidden = type === "demo";
  if (type === "datetime" && !document.getElementById("datetime-fields")?.children.length) {
    addDatetimeField();
    addDatetimeField();
  }
  if (type === "picker" && els.optionFields.children.length < 10) {
    resetOptionFields(defaultPickerOptions());
  }
  syncPickerMultiUi();
  syncPickerCategoriesUi();
  scheduleCreatePickerPreview();
}

function addDatetimeField(value = "") {
  const host = document.getElementById("datetime-fields");
  if (!host || host.children.length >= 6) return;
  const row = document.createElement("div");
  row.className = "option-row";
  row.innerHTML = `<input type="datetime-local" /><button type="button" class="btn ghost" aria-label="Entfernen">✕</button>`;
  if (value) row.querySelector("input").value = value;
  row.querySelector("button").addEventListener("click", () => {
    if (host.children.length <= 2) return;
    row.remove();
  });
  host.append(row);
}

function readFormSlide() {
  const type = els.createType.value;
  const question = els.createQuestion.value.trim() || defaultQuestion(type);
  const subtitle = document.getElementById("create-subtitle")?.value.trim() || "";
  const options = [...els.optionFields.querySelectorAll(".option-row")].map((row, i) => {
    const label = row.querySelector("input[maxlength], input[placeholder='Antwort']")?.value.trim() || row.querySelector("input:not([type=file])")?.value.trim();
    const image = row.dataset.image || "";
    const category = row.dataset.category || row.querySelector(`[data-opt-cat="${i}"]`)?.value || "";
    const opt = { id: `o${i + 1}`, label, image };
    if (category) opt.category = category;
    return opt;
  }).filter((o) => o.label);
  const extra = {};
  extra.resultsVisible = Boolean(document.getElementById("create-results-visible")?.checked);
  if (type === "choice") {
    extra.resultsVisible = !document.getElementById("create-hide-results")?.checked;
  }
  if (type === "wordcloud") {
    extra.resultsVisible = !document.getElementById("create-wc-hide")?.checked;
  }
  if (type === "quiz") {
    extra.correctIndexes = parseCorrectIndexes(els.createCorrect?.value);
    extra.correctIndex = extra.correctIndexes[0] || 0;
    extra.duration = Number(els.createDuration?.value) || 30;
    extra.options = options;
  }
  if (type === "rating_scale") {
    extra.scale = Number(document.getElementById("create-rating-scale")?.value) || 5;
    extra.style = document.getElementById("create-rating-style")?.value || "icons";
  }
  if (type === "datetime") {
    extra.options = [...(document.getElementById("datetime-fields")?.querySelectorAll("input") || [])]
      .map((i) => i.value)
      .filter(Boolean)
      .map((iso, i) => ({ id: `o${i + 1}`, iso, label: iso.replace("T", " ") }));
  }
  if (type === "qa") {
    extra.moderated = Boolean(document.getElementById("create-qa-moderated")?.checked);
  }
  if (type === "picker") {
    extra.options = options;
    extra.allowMultiple = Boolean(document.getElementById("create-picker-multi")?.checked);
    const maxRaw = document.getElementById("create-picker-max")?.value;
    if (extra.allowMultiple && maxRaw) extra.maxSelections = Number(maxRaw);
    extra.enableSearch = document.getElementById("create-picker-search")?.checked !== false;
    extra.layout = document.getElementById("create-picker-layout")?.value || "list";
    extra.subtitle = subtitle;
    if (document.getElementById("create-picker-categories")?.checked) {
      extra.categories = collectCategoriesFromHost(document.getElementById("create-category-fields"));
    } else {
      extra.categories = [];
    }
  }
  if (type === "ranking" || type === "points100" || type === "image_choice") extra.options = options;
  extra.plannedMinutes = els.createPlanned?.value;
  extra.notes = els.createNotes?.value || "";
  if (subtitle && type !== "picker") extra.subtitle = subtitle;
  const needOpts = OPTION_SLIDE_TYPES.has(type);
  return buildSlide(type, question, needOpts ? options : extra.options, extra);
}

function parseCorrectIndexes(value) {
  const nums = String(value || "0")
    .split(/[,;\s]+/)
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0);
  return nums.length ? [...new Set(nums)] : [0];
}

function refreshDraftList() {
  renderDraftList(els.deckDraft, t, {
    onRemove: (id) => {
      removeDraft(id);
      refreshDraftList();
    },
    onMove: (id, dir) => {
      moveDraft(id, dir);
      refreshDraftList();
    },
  });
}

function onAddDraftSlide() {
  if (els.createType.value === "demo") return;
  addDraft(readFormSlide());
  refreshDraftList();
}

function onCreate(ev) {
  ev.preventDefault();
  const type = els.createType.value;
  const question = els.createQuestion.value.trim() || defaultQuestion(type);
  if (type === "demo") {
    startSession({ ...demoPayload(question), rehearsal: Boolean(els.createRehearsal?.checked) });
    return;
  }
  const current = readFormSlide();
  const slides = slidesForStart(current);
  clearDraft();
  refreshDraftList();
  startSession({
    type: current.type,
    question: current.question,
    slides,
    rehearsal: Boolean(els.createRehearsal?.checked),
    options: current.options,
    correctIndex: current.correctIndex,
    duration: current.duration,
    scale: current.scale,
    style: current.style,
    notes: current.notes,
    plannedMinutes: current.plannedMinutes,
  });
}

function onJoinSubmit(ev) {
  ev.preventDefault();
  if (isJoinTeamEnabled()) {
    const team = document.getElementById("join-team")?.value.trim();
    if (team) storeTeamName(team);
  }
  const code = (els.joinCodeInput.value || "").replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) {
    els.joinCodeInput.focus();
    return;
  }
  location.hash = `#/join/${code}`;
}

async function startSession(payload) {
  const remote = await api.createSession(payload);
  const session = remote?.session || localCreateSession(payload);
  if (remote?.adminKey) storeAdminKey(session.code, remote.adminKey);
  api.setAdminKey(readAdminKey(session.code));
  persistLocal(session);
  rememberSession(session);
  location.hash = `#/present/${session.code}`;
}

async function enterPresent(code) {
  const session = await loadSession(code);
  if (!session) {
    location.hash = "#/";
    return;
  }
  ctx.eventCountdownSkipped = false;
  if (session.serverNow) ctx.eventClockSkew = session.serverNow - Date.now();
  ctx.session = session;
  api.setAdminKey(readAdminKey(session.code));
  applyStartType(session);
  mountPresenterStats(els.presenterStats, {
    t,
    onNotes: (value) => patchCurrentSlide({ notes: value }),
    onPlanned: (value) => patchCurrentSlide({ plannedMinutes: value }),
  });
  renderPresenterChrome();
  connectRealtime("presenter");
  renderActiveSlide();
}

async function enterJoin(code) {
  if (!code) {
    const err = explainError("session_missing_code");
    els.joinQuestion.textContent = err.title;
    setJoinFeedback(err.html, { html: true, state: "error" });
    return;
  }
  const session = await loadSession(code);
  if (!session) {
    const err = explainError("session_not_found");
    els.joinQuestion.textContent = err.title;
    setJoinFeedback(err.html, { html: true, state: "error" });
    els.joinChoice.hidden = true;
    els.joinWordForm.hidden = true;
    return;
  }
  ctx.session = stripPresenterSecrets(session);
  els.joinSessionCode.textContent = formatCode(session.code);
  if (els.joinRehearsalHint) {
    els.joinRehearsalHint.hidden = !session.rehearsal;
    els.joinRehearsalHint.textContent = session.rehearsal ? t("join.rehearsalHint") : "";
  }
  connectRealtime("participant");
  renderJoinSlide();
}

async function loadSession(code) {
  if (!code) return ctx.session;
  const remote = await api.getSession(code);
  if (remote?.session) return remote.session;
  return readLocal(code);
}

function connectRealtime(role) {
  teardownRealtime();
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}/ws`;
  const rt = new RealtimeClient(url, { mockWhenOffline: true });
  ctx.rt = rt;

  rt.on("connection", ({ state, mock, label, description }) => {
    const text =
      label || (mock ? "Demo" : state === "open" ? "Live" : state === "reconnecting" ? "Verbinde …" : "Offline");
    els.connectionStatus.dataset.state = state === "open" ? "open" : state === "reconnecting" ? "connecting" : "closed";
    els.connectionStatus.querySelector("span").textContent = text;
    if (description) {
      els.connectionStatus.setAttribute("data-tooltip", description);
      els.connectionStatus.removeAttribute("title");
    }
    if (els.joinConnectionStatus) {
      els.joinConnectionStatus.hidden = false;
      els.joinConnectionStatus.dataset.state = els.connectionStatus.dataset.state;
      const span = els.joinConnectionStatus.querySelector("span");
      if (span) span.textContent = text;
    }
    syncOfflineBanner(els.presentOfflineBanner, { state, mock, t });
    syncOfflineBanner(els.joinOfflineBanner, { state, mock, t });
    if (ctx.role === "present" && state === "open") {
      if (mock || ctx.session?.rehearsal) startDemoSimulator();
      else stopDemoSimulator();
    }
  });

  rt.on("session", (payload) => applySession(payload.session || payload));
  rt.on("server_shutdown", (payload) => {
    const sec = payload?.reconnectIn ?? 10;
    const msg = payload?.message || `Server startet neu — Reconnect in ${sec} Sekunden …`;
    if (els.connectionStatus?.querySelector("span")) {
      els.connectionStatus.querySelector("span").textContent = msg;
      els.connectionStatus.dataset.state = "connecting";
    }
    if (els.joinConnectionStatus?.querySelector("span")) {
      els.joinConnectionStatus.querySelector("span").textContent = msg;
      els.joinConnectionStatus.dataset.state = "connecting";
    }
  });
  /* Update-Fortschritt optional anbinden (Modul darf Admin-Start nicht blockieren). */
  import("./updatesPage.js?v=nav44")
    .then((m) => m.bindUpdateWsEvents(rt))
    .catch(() => {});
  rt.on("pong", (payload) => {
    const now = payload?.serverNow ?? payload?.ts;
    if (now != null) ctx.eventClockSkew = Number(now) - Date.now();
  });
  rt.on("poll:update", (payload) => {
    patchSlideResults(payload);
    if (ctx.role === "join" && ctx.pendingVoteSlideId && payload.slideId === ctx.pendingVoteSlideId) {
      ctx.votedSlide.add(ctx.pendingVoteSlideId);
      ctx.pendingVoteSlideId = null;
    }
    if (ctx.role === "present") syncPresentResults();
  });
  rt.on("wordcloud:update", (payload) => {
    patchSlideResults(payload);
    if (ctx.role === "present") {
      if (currentSlide()?.resultsVisible) updateWordCloud(payload.entries || []);
      syncPresentResults();
    }
  });
  rt.on("participants", (payload) => {
    const n = payload.count ?? payload;
    if (ctx.session) ctx.session.participantCount = n;
    els.participantCount.textContent = String(n);
    const lobbyN = document.getElementById("lobby-participants");
    if (lobbyN) lobbyN.textContent = String(n);
    refreshPresenterPanel();
  });
  rt.on("slide", (payload) => {
    if (!ctx.session) return;
    ctx.session.activeSlideIndex = payload.index;
    if (payload.slide) {
      const incoming = ctx.role === "join" ? stripSlideSecrets(payload.slide) : payload.slide;
      ctx.session.slides[payload.index] = { ...ctx.session.slides[payload.index], ...incoming };
    }
    if (ctx.role === "present") renderActiveSlide();
    else renderJoinSlide();
  });
  rt.on("deck", (payload) => applyDeckEvent(payload));
  rt.on("slide_updated", (payload) => {
    if (!ctx.session || !payload?.slide) return;
    const idx = (ctx.session.slides || []).findIndex((s) => s.id === payload.slide.id);
    if (idx < 0) return;
    const prev = ctx.session.slides[idx] || {};
    ctx.session.slides[idx] = { ...prev, ...payload.slide };
    if (payload.activeSlideIndex != null) ctx.session.activeSlideIndex = payload.activeSlideIndex;
    if (ctx.role === "join") stripPresenterSecrets(ctx.session);
    persistLocal(ctx.session);
    const active = currentSlide();
    if (active?.id === payload.slide.id) {
      if (ctx.role === "present") renderActiveSlide();
      else if (ctx.role === "join") renderJoinSlide();
    }
  });
  rt.on("lobby", (payload) => {
    if (!ctx.session) return;
    ctx.session.lobby = Boolean(payload.lobby);
    persistLocal(ctx.session);
    if (ctx.role === "present") renderLobby();
    else renderJoinSlide();
  });
  rt.on("interaction", (payload) => {
    if (!ctx.session || !payload?.slideId) return;
    const slide = ctx.session.slides.find((s) => s.id === payload.slideId);
    if (slide && payload.interaction) {
      slide.interaction = { ...slide.interaction, ...payload.interaction };
      if (payload.interaction.state === "running") resetJoinTimerAnnouncements(slide.id);
    }
    if (payload.serverNow) ctx.eventClockSkew = payload.serverNow - Date.now();
    persistLocal(ctx.session);
    syncInteractionTick();
    if (ctx.role === "present") {
      if (slide?.id === currentSlide()?.id) renderActiveSlide();
      else interactionBarCtrl?.render();
    } else if (ctx.role === "join") {
      renderJoinSlide();
    }
  });
  rt.on("event_meta", (payload) => {
    if (!ctx.session || !payload?.eventMeta) return;
    ctx.session.eventMeta = { ...ctx.session.eventMeta, ...payload.eventMeta };
    if (payload.serverNow) ctx.eventClockSkew = payload.serverNow - Date.now();
    ctx.eventCountdownSkipped = Boolean(payload.eventMeta.countdownDismissed);
    persistLocal(ctx.session);
    if (ctx.role === "present") {
      presentCountdownCtl?.stop();
      presentCountdownCtl = null;
      renderLobby();
      renderActiveSlide();
    }
  });
  rt.on("results", (payload) => {
    const slide = ctx.session?.slides.find((s) => s.id === payload.slideId) || currentSlide();
    if (slide) {
      slide.resultsVisible = Boolean(payload.resultsVisible);
      if (payload.voteCount != null) slide.voteCount = payload.voteCount;
    }
    if (ctx.role === "present") {
      renderActiveSlide();
    }
  });
  rt.on("reaction", (payload) => {
    burstReaction(els.presentStage, payload.emoji);
  });
  rt.on("vote", (payload) => {
    if (ctx.role === "present" && rt.mock) applyLocalVote(payload);
  });
  rt.on("word", (payload) => {
    if (ctx.role === "present" && rt.mock) applyLocalWord(payload);
  });
  rt.on("reset", () => {
    if (!ctx.session) return;
    for (const slide of ctx.session.slides) resetSlideData(slide);
    if (ctx.role === "present") renderActiveSlide();
    else renderJoinSlide();
  });

  rt.on("new_question", (q) => patchQuestion(q, true));
  rt.on("question_upvoted", (payload) => {
    const slide = ctx.session?.slides.find((s) => s.type === "qa") || currentSlide();
    const q = slide?.questions?.find((item) => item.id === payload.questionId);
    if (q) {
      q.upvotes = payload.count ?? q.upvotes;
      if (payload.voterId === api.clientId) q.voted = true;
    }
    if (payload.question) patchQuestion(payload.question, false);
    refreshQaView();
  });
  rt.on("question_moderated", (payload) => {
    const slide = ctx.session?.slides.find((s) => s.type === "qa") || currentSlide();
    const q = slide?.questions?.find((item) => item.id === payload.questionId);
    if (q) q.status = payload.status;
    if (payload.question) patchQuestion(payload.question, false);
    refreshQaView();
  });
  rt.on("quiz_started", onQuizStarted);
  rt.on("quiz_start", (payload) => {
    if (!rt.mock) return;
    onQuizStarted({
      slideId: payload.questionId || payload.slideId,
      duration: payload.duration,
      startedAt: payload.startedAt || Date.now(),
    });
  });
  rt.on("quiz_timer", (payload) => {
    if (currentSlide()?.type === "quiz") setQuizRemaining(payload.remaining);
  });
  rt.on("quiz_results", (payload) => {
    applyQuizResults(payload);
  });
  rt.on("leaderboard_update", (payload) => {
    if (payload.top10) updateLeaderboard(payload.top10);
    if (payload.overall) {
      if (ctx.session) ctx.session.quizOverall = payload.overall;
      showOverallLeaderboard(payload.overall);
    }
  });
  rt.on("quiz_powerup", (payload) => {
    if (payload.kind === "fifty" && payload.hide) applyFiftyFifty(payload.hide);
    document.querySelector(`[data-power="${payload.kind}"]`)?.setAttribute("disabled", "true");
  });
  rt.on("submit_question", (payload) => applyMockQuestion(payload));
  rt.on("upvote_question", (payload) => applyMockUpvote(payload));
  rt.on("moderate_question", (payload) => applyMockModerate(payload));
  rt.on("quiz_answer", (payload) => applyMockQuizAnswer(payload));
  rt.on("quiz_end", () => {
    if (rt.mock && ctx.role === "present") finishMockQuiz();
  });

  rt.on("emergency_activated", () => {
    showEmergencyBanner(true);
    setPanicState(els.panicButton, true);
    if (ctx.session) ctx.session.paused = true;
  });
  rt.on("emergency_resumed", () => {
    showEmergencyBanner(false);
    setPanicState(els.panicButton, false);
    if (ctx.session) ctx.session.paused = false;
  });
  rt.on("qa_timer", (payload) => {
    const slide = ctx.session?.slides.find((s) => s.id === payload.slideId) || currentSlide();
    if (slide && payload.qaTimer) {
      slide.qaTimer = payload.qaTimer;
      applyQaTimerSnapshot(payload.qaTimer, payload.serverNow);
    }
  });
  rt.on("error", (payload) => {
    const msg = payload?.message || payload?.error || "Verbindungsfehler";
    if (ctx.role === "join") {
      if (payload?.error === "blocked") setJoinFeedback(t("qa.blocked"), { state: "error" });
      else if (payload?.error === "qa_closed") setJoinFeedback(t("qa.closed"), { state: "error" });
      else if (payload?.error === "rate") setJoinFeedback(t("qa.rateWait", { n: payload.waitTime || 30 }), { state: "error" });
      else if (payload?.error === "interaction_not_started") setJoinFeedback(t("interaction.join.waiting"), { state: "info" });
      else if (payload?.error === "interaction_paused") {
        setJoinFeedback(t("interaction.join.paused"), { state: "info" });
        rollbackPendingVote();
      }
      else if (payload?.error === "interaction_ended") {
        setJoinFeedback(t("interaction.join.ended"), { state: "info" });
        rollbackPendingVote();
      }
      else if (payload?.error === "invalid") {
        setJoinFeedback(t("interaction.join.rankIncomplete"), { state: "error" });
        rollbackPendingVote();
      } else if (payload?.error === "sum") {
        setJoinFeedback(t("interaction.join.pointsIncomplete"), { state: "error" });
        rollbackPendingVote();
      } else if (payload?.pendingReview) setJoinFeedback(t("qa.pendingHint"));
      else setJoinFeedback(explainError(msg).html, { html: true, state: "error" });
      if (ctx.pendingVoteSlideId) rollbackPendingVote();
    }
    if (payload?.error === "auth_required") {
      setJoinFeedback(t("events.accessDenied"), { state: "error" });
      return;
    }
    if (msg.toLowerCase().includes("admin") && payload?.error !== "auth_required") els.adminDialog?.showModal?.();
  });

  rt.on("open", () => {
    rt.send("join", { code: ctx.session?.code, role, adminKey: api.adminKey, clientId: api.clientId, teamName: readTeamName() });
  });

  rt.connect();
}

function teardownRealtime() {
  stopDemoSimulator();
  clearInteractionTick();
  destroyPresenterStats();
  ctx.rt?.disconnect();
  ctx.rt = null;
  destroyPoll();
  destroyWordCloud();
  destroyQaTimer();
  destroyQA();
  destroyQuiz();
  destroySlideInput(els.joinExtra);
  destroySlideInput(els.pollRoot);
}

function applySession(session) {
  if (!session) return;
  if (session.serverNow) ctx.eventClockSkew = session.serverNow - Date.now();
  if (session.eventMeta?.countdownDismissed) ctx.eventCountdownSkipped = true;
  if (ctx.role === "join") {
    stripPresenterSecrets(session);
    ctx.session = session;
  } else {
    const prev = new Map((ctx.session?.slides || []).map((s) => [s.id, s]));
    session.slides = (session.slides || []).map((s) => {
      const old = prev.get(s.id);
      return {
        ...old,
        ...s,
        notes: s.notes != null ? s.notes : old?.notes,
        plannedMinutes: s.plannedMinutes != null ? s.plannedMinutes : old?.plannedMinutes,
      };
    });
    ctx.session = { ...ctx.session, ...session };
  }
  persistLocal(ctx.session);
  applyEventBrandingOverlay(session);
  showEmergencyBanner(Boolean(session.paused));
  setPanicState(els.panicButton, Boolean(session.paused));
  if (ctx.role === "present") {
    renderPresenterChrome();
    renderActiveSlide();
  } else if (ctx.role === "join") {
    renderJoinSlide();
  }
  syncInteractionTick();
}

function renderPresenterChrome() {
  const s = ctx.session;
  const url = joinUrl(s.code);
  els.joinCodeDisplay.textContent = formatCode(s.code);
  els.joinUrl.textContent = url.replace(/^https?:\/\//, "");
  els.participantCount.textContent = String(s.participantCount || 0);
  drawQrCode(els.qrCanvas, url);
  const lobbyCode = document.getElementById("lobby-code");
  const lobbyQr = document.getElementById("lobby-qr");
  const lobbyN = document.getElementById("lobby-participants");
  if (lobbyCode) lobbyCode.textContent = formatCode(s.code);
  if (lobbyN) lobbyN.textContent = String(s.participantCount || 0);
  if (lobbyQr) drawQrCode(lobbyQr, url);
  renderLobby();
  syncRehearsalUi(els.rehearsalBanner, s, t, {
    joinBlock: document.querySelector(".join-block"),
    copyBtn: els.btnCopyLink,
  });
  refreshPresenterPanel();
}

function renderActiveSlide() {
  const s = ctx.session;
  if (!s) return;
  const countdownOn = syncPresentEventCountdown();
  const index = s.activeSlideIndex || 0;
  const slide = s.slides[index];
  if (!slide) return;
  els.presentQuestion.textContent = slide.question;
  els.slideIndicator.textContent = `${index + 1} / ${s.slides.length}`;
  renderPresentStrip(els.presentDeck, s, t, {
    onGoto: (i) => shiftSlide(i - (s.activeSlideIndex || 0)),
    onAdd: openSlideDialog,
  });

  if (countdownOn) {
    els.pollRoot.hidden = true;
    els.wordcloudRoot.hidden = true;
    els.qaRoot.hidden = true;
    els.quizRoot.hidden = true;
    if (els.presentQuestion) els.presentQuestion.hidden = true;
    destroyPoll();
    destroyWordCloud();
    destroyQA();
    destroyQuiz();
    destroySlideInput(els.pollRoot);
    refreshPresenterPanel();
    return;
  }

  const type = slide.type;
  const pollTypes = new Set(["choice", "rating_scale", "ranking", "points100", "open_text", "image_choice", "datetime", "picker"]);
  els.pollRoot.hidden = !pollTypes.has(type);
  els.wordcloudRoot.hidden = type !== "wordcloud";
  els.qaRoot.hidden = type !== "qa";
  els.quizRoot.hidden = type !== "quiz";
  destroyPoll();
  destroyWordCloud();
  destroyQA();
  destroyQuiz();
  destroySlideInput(els.pollRoot);

  if (type === "choice") {
    initPoll(els.pollRoot, slide);
    updatePollResults({ counts: slide.counts || {}, results: slide.results });
  } else if (type === "rating_scale") {
    initRatingScale(els.pollRoot, slide);
    updateRatingResults({ counts: slide.counts || {} });
  } else if (type === "wordcloud") {
    const gen = ++wordcloudGen;
    const slideRef = slide;
    ensureWordCloud().then((mod) => {
      if (gen !== wordcloudGen || currentSlide()?.type !== "wordcloud") return;
      mod.initWordCloud(els.wordcloudRoot, { canvas: els.wordcloudCanvas, list: els.wordList, exportable: true });
      requestAnimationFrame(() => mod.updateWordCloud(slideRef.entries || []));
    });
  } else if (type === "qa") {
    mountQa(els.qaRoot, "presenter", slide);
  } else if (type === "quiz") {
    mountQuiz(els.quizRoot, "presenter", slide);
  } else if (pollTypes.has(type)) {
    if (type === "picker") {
      import("./picker.js").then(({ renderPickerResults }) => renderPickerResults(els.pollRoot, slide, { t }));
    } else renderTypedResults(els.pollRoot, slide, { t });
  }
  syncPresentResults();
  syncInteractionTick();
  refreshPresenterPanel();
}

function renderJoinSlide() {
  const s = ctx.session;
  if (!s) return;
  const slide = s.slides[s.activeSlideIndex || 0];
  els.joinSessionCode.textContent = formatCode(s.code);
  const waiting = Boolean(s.lobby);
  if (els.joinLobby) els.joinLobby.hidden = !waiting;
  if (els.joinRehearsalHint) {
    els.joinRehearsalHint.hidden = !s.rehearsal;
    if (s.rehearsal) els.joinRehearsalHint.textContent = t("join.rehearsalHint");
  }
  if (waiting) {
    els.joinQuestion.textContent = t("lobby.wait");
    els.joinChoice.hidden = true;
    els.joinWordForm.hidden = true;
    els.joinQa.hidden = true;
    els.joinQuiz.hidden = true;
    if (els.joinRating) els.joinRating.hidden = true;
    if (els.joinExtra) els.joinExtra.hidden = true;
    els.joinFeedback.textContent = "";
    return;
  }
  els.joinQuestion.textContent = slide.question;
  setJoinFeedback("");
  resetJoinTimerAnnouncements(slide.id);
  const inputBlocked = joinInputsBlocked(slide) || Boolean(s.paused);
  const ixMsg = joinStatusMessage(slide);
  if (ixMsg) setJoinFeedback(ixMsg, { state: "info" });
  updateJoinInteractionHint(slide);
  const voted = ctx.votedSlide.has(slide.id);
  els.joinChoice.hidden = slide.type !== "choice";
  els.joinWordForm.hidden = slide.type !== "wordcloud";
  els.joinQa.hidden = slide.type !== "qa";
  els.joinQuiz.hidden = slide.type !== "quiz";
  if (els.joinRating) els.joinRating.hidden = slide.type !== "rating_scale";
  const extraTypes = new Set(["ranking", "points100", "open_text", "image_choice", "datetime", "picker"]);
  if (els.joinExtra) els.joinExtra.hidden = !extraTypes.has(slide.type);
  destroyQA();
  destroyQuiz();
  if (els.joinExtra) destroySlideInput(els.joinExtra);

  if (slide.type === "choice") {
    els.joinWordForm.hidden = true;
    els.joinChoice.hidden = false;
    els.joinChoice.innerHTML = "";
    slide.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn pulse-choice-btn";
      btn.dataset.color = String(i);
      btn.dataset.optionId = opt.id;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", voted ? "true" : "false");
      btn.tabIndex = voted ? -1 : i === 0 ? 0 : -1;
      btn.textContent = opt.label;
      btn.disabled = voted || inputBlocked;
      if (voted) btn.classList.add("is-selected");
      btn.addEventListener("click", () => submitVote(opt.id, btn));
      els.joinChoice.append(btn);
    });
    els.joinChoice.onkeydown = onChoiceKeys;
  } else if (slide.type === "rating_scale") {
    renderRatingInput(els.joinRating, slide, {
      disabled: voted || inputBlocked,
      onPick: (value, btn) => submitVote(String(value), btn),
    });
  } else if (slide.type === "wordcloud") {
    els.wordInput.disabled = inputBlocked;
  } else if (slide.type === "qa") {
    mountQa(els.joinQa, "participant", slide);
  } else if (slide.type === "quiz") {
    mountQuiz(els.joinQuiz, "participant", slide);
  } else if (slide.type === "ranking") {
    renderRankingInput(els.joinExtra, slide.options, {
      disabled: voted || inputBlocked,
      t,
      onSubmit: (payload) => submitTypedVote(payload),
    });
  } else if (slide.type === "points100") {
    renderPointsInput(els.joinExtra, slide.options, {
      disabled: voted || inputBlocked,
      t,
      onSubmit: (payload) => submitTypedVote(payload),
    });
  } else if (slide.type === "open_text") {
    renderOpenTextInput(els.joinExtra, {
      disabled: voted || inputBlocked,
      t,
      onSubmit: (payload) => submitTypedVote(payload),
    });
  } else if (slide.type === "image_choice") {
    renderImageChoiceInput(els.joinExtra, slide.options, {
      disabled: voted || inputBlocked,
      onSubmit: (payload) => {
        if (payload.btn) payload.btn.classList.add("is-selected");
        submitTypedVote(payload);
      },
    });
  } else if (slide.type === "datetime") {
    renderDatetimeInput(els.joinExtra, slide.options, {
      disabled: voted || inputBlocked,
      t,
      onSubmit: (payload) => submitTypedVote(payload),
    });
  } else if (slide.type === "picker") {
    renderPickerInput(els.joinExtra, slide, {
      disabled: voted || inputBlocked,
      t,
      onSubmit: (payload) => submitTypedVote(payload),
    });
  }
  syncInteractionTick();
}

function submitTypedVote(payload) {
  const slide = currentSlide();
  if (!slide || ctx.votedSlide.has(slide.id) || ctx.session?.paused) return;
  if (joinInputsBlocked(slide)) {
    setJoinFeedback(joinStatusMessage(slide) || t("interaction.join.timeout"), { state: "info" });
    return;
  }
  ctx.rt?.send("vote", { code: ctx.session.code, slideId: slide.id, ...payload });
  ctx.pendingVoteSlideId = slide.id;
  hapticSuccess();
  playBrandSound();
  setJoinFeedback(t("join.voted"));
  if (els.joinExtra) {
    els.joinExtra.querySelectorAll("button, input, textarea").forEach((el) => {
      el.disabled = true;
    });
  }
}

function submitVote(optionId, btn) {
  const slide = currentSlide();
  if (!slide || ctx.votedSlide.has(slide.id) || ctx.session?.paused || joinInputsBlocked(slide)) return;
  ctx.votedSlide.add(slide.id);
  btn.classList.add("is-selected");
  btn.setAttribute("aria-selected", "true");
  const group = btn.parentElement || els.joinChoice;
  for (const b of group.querySelectorAll("button")) b.disabled = true;
  ctx.rt?.send("vote", { code: ctx.session.code, optionId, slideId: slide.id });
  hapticSuccess();
  playBrandSound();
  setJoinFeedback(t("join.voted"));
}

function onChoiceKeys(ev) {
  const buttons = [...els.joinChoice.querySelectorAll("button:not(:disabled)")];
  if (!buttons.length) return;
  const current = document.activeElement;
  const idx = Math.max(0, buttons.indexOf(current));
  if (ev.key === "ArrowDown" || ev.key === "ArrowRight") {
    ev.preventDefault();
    focusChoice(buttons, idx + 1);
  } else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") {
    ev.preventDefault();
    focusChoice(buttons, idx - 1);
  } else if (ev.key === "Home") {
    ev.preventDefault();
    focusChoice(buttons, 0);
  } else if (ev.key === "End") {
    ev.preventDefault();
    focusChoice(buttons, buttons.length - 1);
  }
}

function focusChoice(buttons, index) {
  const next = buttons[(index + buttons.length) % buttons.length];
  for (const b of buttons) b.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
}

function onAdminUnlock(ev) {
  ev.preventDefault();
  const key = (els.adminKeyInput?.value || "").trim();
  if (!ctx.session) return;
  if (key) {
    storeAdminKey(ctx.session.code, key);
    api.setAdminKey(key);
  }
  els.adminDialog?.close();
  ctx.rt?.send("join", { code: ctx.session.code, role: "presenter", adminKey: key || api.adminKey });
}

function onWordSubmit(ev) {
  ev.preventDefault();
  const text = (els.wordInput.value || "").trim();
  if (!text) return;
  const slide = currentSlide();
  if (!slide || joinInputsBlocked(slide) || ctx.session?.paused) return;
  ctx.rt?.send("word", { code: ctx.session.code, text, slideId: slide.id });
  els.wordInput.value = "";
  hapticSuccess();
  playBrandSound();
  setJoinFeedback(t("join.wordSent"));
}

/**
 * Stimmen-UI nach serverseitiger Ablehnung wieder freigeben.
 */
function rollbackPendingVote() {
  ctx.pendingVoteSlideId = null;
  const slide = currentSlide();
  if (!slide || !els.joinExtra) return;
  const blocked = joinInputsBlocked(slide) || ctx.session?.paused;
  els.joinExtra.querySelectorAll("button, input, textarea").forEach((el) => {
    el.disabled = blocked || ctx.votedSlide.has(slide.id);
  });
}

/**
 * Statuszeile in der Teilnehmeransicht — Text und optionaler Zustand (success/error).
 * @param {string} content
 * @param {{ html?: boolean, state?: string }} [opts]
 */
function setJoinFeedback(content, { html = false, state = "" } = {}) {
  const el = els.joinFeedback;
  if (!el) return;
  if (html) el.innerHTML = content || "";
  else el.textContent = content || "";
  if (state) el.dataset.state = state;
  else el.removeAttribute("data-state");
}

function currentSlide() {
  return ctx.session?.slides[ctx.session.activeSlideIndex || 0];
}

function isLiveServer() {
  return ctx.rt && ctx.rt.state === "open" && !ctx.rt.mock;
}

function applyLocalVote(payload) {
  const slide = ctx.session?.slides.find((s) => s.id === payload.slideId) || currentSlide();
  if (!slide) return;
  if (slide.type === "choice" || slide.type === "rating_scale" || slide.type === "image_choice") {
    slide.counts = slide.counts || {};
    slide.counts[payload.optionId] = (slide.counts[payload.optionId] || 0) + 1;
  } else if (slide.type === "picker") {
    slide.counts = slide.counts || {};
    if (payload.optionId) slide.counts[payload.optionId] = (slide.counts[payload.optionId] || 0) + 1;
    if (Array.isArray(payload.optionIds)) {
      for (const id of payload.optionIds) slide.counts[id] = (slide.counts[id] || 0) + 1;
    }
    slide.voteCount = (slide.voteCount || 0) + 1;
  } else if (slide.type === "datetime" && Array.isArray(payload.slotIds)) {
    slide.counts = slide.counts || {};
    for (const id of payload.slotIds) slide.counts[id] = (slide.counts[id] || 0) + 1;
    slide.voteCount = (slide.voteCount || 0) + 1;
  } else if (slide.type === "open_text" && payload.text) {
    slide.entries = slide.entries || [];
    const found = slide.entries.find((e) => e.text.toLowerCase() === String(payload.text).toLowerCase());
    if (found) found.count += 1;
    else slide.entries.push({ text: payload.text, count: 1 });
  }
  persistLocal(ctx.session);
  if (ctx.role === "present" && slide === currentSlide()) {
    if (slide.type === "rating_scale") updateRatingResults({ counts: slide.counts });
    else if (slide.type === "choice") updatePollResults({ counts: slide.counts });
    else renderTypedResults(els.pollRoot, slide, { t });
  }
  ctx.rt?.send("poll:update", { slideId: slide.id, counts: slide.counts, entries: slide.entries });
  refreshPresenterPanel();
}

function applyLocalWord(payload) {
  const slide = ctx.session?.slides.find((s) => s.id === payload.slideId) || currentSlide();
  if (!slide || slide.type !== "wordcloud") return;
  const key = normalizeWord(payload.text);
  if (!key) return;
  const map = new Map((slide.entries || []).map((e) => [e.text, e.count]));
  map.set(key, (map.get(key) || 0) + 1);
  slide.entries = [...map.entries()].map(([text, count]) => ({ text, count }));
  persistLocal(ctx.session);
  if (ctx.role === "present" && slide === currentSlide()) {
    updateWordCloud(slide.entries);
  }
  ctx.rt?.send("wordcloud:update", { slideId: slide.id, entries: slide.entries });
  refreshPresenterPanel();
}

function patchSlideResults(payload) {
  const slide = ctx.session?.slides.find((s) => s.id === payload.slideId) || currentSlide();
  if (!slide) return;
  if (payload.counts) slide.counts = payload.counts;
  if (payload.entries) slide.entries = payload.entries;
  if (payload.voteCount != null) slide.voteCount = payload.voteCount;
  if (payload.resultsVisible != null) slide.resultsVisible = payload.resultsVisible;
  if (payload.ranks) slide.ranks = payload.ranks;
  if (payload.points) slide.points = payload.points;
  persistLocal(ctx.session);
}

function shiftSlide(delta) {
  if (!ctx.session) return;
  const next = Math.max(0, Math.min(ctx.session.slides.length - 1, (ctx.session.activeSlideIndex || 0) + delta));
  if (next === ctx.session.activeSlideIndex) return;
  ctx.session.activeSlideIndex = next;
  persistLocal(ctx.session);
  renderActiveSlide();
  ctx.rt?.send("slide", { code: ctx.session.code, index: next, slide: currentSlide() });
  if (isLiveServer()) api.setSlide(ctx.session.code, next);
}

function resetResults() {
  if (!ctx.session) return;
  for (const slide of ctx.session.slides) resetSlideData(slide);
  persistLocal(ctx.session);
  renderActiveSlide();
  ctx.rt?.send("reset", { code: ctx.session.code });
  if (isLiveServer()) api.resetSession(ctx.session.code);
}

function resetSlideData(slide) {
  slide.counts = {};
  slide.entries = [];
  slide.ranks = {};
  slide.sums = {};
  slide.voteCount = 0;
  if (slide.options) for (const o of slide.options) slide.counts[o.id] = 0;
  if (slide.type === "qa") slide.questions = [];
  if (slide.type === "quiz") {
    slide.round = { status: "idle" };
    slide.scores = {};
  }
}

function startDemoSimulator() {
  stopDemoSimulator();
  if (!ctx.session) return;
  ctx.sim = window.setInterval(() => {
    if (document.hidden || ctx.role !== "present") return;
    if (ctx.session.lobby) return;
    const slide = currentSlide();
    if (!slide) return;
    if (slide.type === "choice") {
      const opt = slide.options[Math.floor(Math.random() * slide.options.length)];
      applyLocalVote({ optionId: opt.id, slideId: slide.id });
    } else if (slide.type === "wordcloud") {
      applyLocalWord({ text: randomDemoWord(), slideId: slide.id });
    }
    if (Math.random() < 0.35) {
      ctx.session.participantCount = (ctx.session.participantCount || 0) + 1;
      els.participantCount.textContent = String(ctx.session.participantCount);
      refreshPresenterPanel();
    }
  }, 1400);
}

function stopDemoSimulator() {
  window.clearInterval(ctx.sim);
  ctx.sim = 0;
}

function onHotkeys(ev) {
  if (ctx.role !== "present") return;
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
  if (ev.key === "ArrowRight" || ev.key === " ") {
    if (currentSlide()?.type === "quiz" && ev.key === " ") return;
    ev.preventDefault();
    shiftSlide(1);
  } else if (ev.key === "ArrowLeft") {
    shiftSlide(-1);
  } else if (ev.key.toLowerCase() === "r") {
    toggleResults();
  } else if (ev.key.toLowerCase() === "t") {
    toggleTheme();
  }
}

/**
 * Theme umschalten: Preference speichern, Branding-Kontrast neu prüfen,
 * Wortwolkenfarben an die neuen Tokens koppeln.
 */
function toggleTheme() {
  toggleDocumentTheme();
  applyBrandingContrast();
  if (ctx.role === "present" && currentSlide()?.type === "wordcloud") {
    updateWordCloud(currentSlide().entries || []);
  }
}

function joinUrl(code) {
  return joinUrlFromLocation(code);
}

function formatCode(code) {
  const d = String(code || "").padStart(6, "0");
  return `${d.slice(0, 3)} ${d.slice(3)}`;
}

function persistLocal(session) {
  if (!session?.code) return;
  try {
    const copy = ctx.role === "join" ? stripPresenterSecrets({ ...session, slides: (session.slides || []).map((s) => ({ ...s })) }) : session;
    localStorage.setItem(LOCAL_SESSION_PREFIX + copy.code, JSON.stringify(copy));
  } catch {
    /* Quota */
  }
}

function presenterFieldsFromExtra(extra = {}) {
  const out = {};
  if (extra.notes != null) out.notes = String(extra.notes).slice(0, 4000);
  if (extra.subtitle != null) out.subtitle = String(extra.subtitle).slice(0, 200);
  if (extra.resultsVisible === true) out.resultsVisible = true;
  const n = Number(extra.plannedMinutes);
  if (Number.isFinite(n) && n > 0) out.plannedMinutes = Math.max(1, Math.min(180, Math.round(n)));
  return out;
}

function stripSlideSecrets(slide) {
  if (!slide) return slide;
  const next = { ...slide };
  delete next.notes;
  delete next.plannedMinutes;
  if (next.type === "quiz" && next.round?.status !== "ended") {
    delete next.correctIndex;
    delete next.correctIndexes;
  }
  return next;
}

function refreshPresenterPanel() {
  if (ctx.role !== "present" || !ctx.session) return;
  refreshPresenterStats({ session: ctx.session, t, lobby: Boolean(ctx.session.lobby) });
  interactionBarCtrl?.render();
}

/** Countdown lokal aktualisieren, solange Interaktion läuft oder pausiert ist. */
function syncInteractionTick() {
  clearInteractionTick();
  const slide = currentSlide();
  const ix = slide?.interaction;
  if (!ix?.timerEnabled) return;
  const state = ix.state;
  if (state !== "running" && state !== "paused") return;
  interactionTickTimer = setInterval(() => {
    const active = currentSlide();
    if (!active?.interaction?.timerEnabled) {
      clearInteractionTick();
      return;
    }
    const now = Date.now() + (ctx.eventClockSkew || 0);
    active.interaction.remainingMs = computeRemainingMs(active, now);
    if (ctx.role === "present") interactionBarCtrl?.render();
    else if (ctx.role === "join") updateJoinInteractionHint(active);
  }, 1000);
}

function clearInteractionTick() {
  if (interactionTickTimer) clearInterval(interactionTickTimer);
  interactionTickTimer = null;
}

/** Timer- und Statushinweis in der Teilnehmeransicht aktualisieren. */
function updateJoinInteractionHint(slide) {
  const hint = document.getElementById("join-interaction-hint");
  const srLive = document.getElementById("join-interaction-sr");
  const typeHint = document.getElementById("join-timer-type-hint");
  if (!slide) return;
  const blocked = joinInputsBlocked(slide);
  const msg = joinStatusMessage(slide);
  let text = msg;
  let remSec = 0;
  if (slide.interaction?.timerEnabled && slide.interaction.state === "running") {
    const rem = computeRemainingMs(slide, Date.now() + (ctx.eventClockSkew || 0));
    remSec = Math.ceil(rem / 1000);
    text = `${t("interaction.join.running")} · ${formatCountdown(remSec)}`;
    if (remSec <= 30) text += ` — ${t("interaction.join.secondsLeft", { n: remSec <= 10 ? 10 : 30 })}`;
    tickJoinTimerA11y(slide, rem, srLive);
    applyJoinTimerUrgency(hint, remSec);
  } else if (hint) {
    hint.classList.remove("is-warn", "is-critical");
  }
  if (hint) {
    hint.textContent = text || "";
    hint.hidden = !text;
  }
  const typeMsg = joinTimerTypeHint(slide, remSec);
  if (typeHint) {
    typeHint.textContent = typeMsg;
    typeHint.hidden = !typeMsg;
  }
  if (blocked && msg) setJoinFeedback(msg, { state: "info" });
}

function patchCurrentSlide(fields) {
  const slide = currentSlide();
  if (!slide) return;
  if (fields.notes != null) slide.notes = String(fields.notes).slice(0, 4000);
  if (Object.prototype.hasOwnProperty.call(fields, "plannedMinutes")) {
    const n = Number(fields.plannedMinutes);
    slide.plannedMinutes = Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(3600, Math.round(n))) : null;
  }
  persistLocal(ctx.session);
  if (isLiveServer()) {
    api.updateDeck(ctx.session.code, "patch", { id: slide.id, notes: slide.notes, plannedMinutes: slide.plannedMinutes });
  }
}

function storeAdminKey(code, key) {
  try {
    sessionStorage.setItem(ADMIN_KEY_PREFIX + code, key);
  } catch {
    /* ignore */
  }
}

function readAdminKey(code) {
  try {
    return sessionStorage.getItem(ADMIN_KEY_PREFIX + code) || "";
  } catch {
    return "";
  }
}

function readLocal(code) {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SESSION_PREFIX + code) || "null");
  } catch {
    return null;
  }
}

function localCreateSession(payload) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const slides =
    payload.type === "demo" || payload.slides
      ? payload.slides || demoPayload(payload.question).slides
      : [buildSlide(payload.type, payload.question, payload.options, payload)];
  return {
    code,
    slides,
    activeSlideIndex: 0,
    participantCount: 0,
    lobby: payload.skipLobby || payload.type === "demo" ? false : true,
    rehearsal: Boolean(payload.rehearsal),
  };
}

function buildSlide(type, question, options, extra = {}) {
  const meta = presenterFieldsFromExtra(extra);
  if (type === "wordcloud") {
    return { id: uid(), type: "wordcloud", question, entries: [], resultsVisible: extra.resultsVisible === true, ...meta };
  }
  if (type === "qa") {
    return { id: uid(), type: "qa", question, moderated: true, questions: extra.questions || [], ...meta };
  }
  if (type === "rating_scale") {
    const scale = extra.scale === 7 || extra.scale === 10 ? extra.scale : 5;
    const opts = Array.from({ length: scale }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }));
    const counts = {};
    for (const o of opts) counts[o.id] = 0;
    return {
      id: uid(),
      type: "rating_scale",
      question,
      scale,
      style: extra.style || "icons",
      rating: extra.rating,
      options: opts,
      counts,
      resultsVisible: extra.resultsVisible === true,
      ...meta,
    };
  }
  if (type === "quiz") {
    const opts = (options && options.length >= 2 ? options : defaultOptions()).slice(0, 6);
    const indexes = extra.correctIndexes || [extra.correctIndex ?? extra.correct ?? 1];
    return {
      id: uid(),
      type: "quiz",
      question,
      options: opts,
      correctIndexes: indexes,
      correctIndex: indexes[0],
      duration: extra.duration || 30,
      round: { status: "idle" },
      scores: {},
      ...meta,
    };
  }
  if (type === "ranking") {
    const opts = (options && options.length >= 2 ? options : defaultOptions()).slice(0, 6);
    return { id: uid(), type: "ranking", question, options: opts, ranks: {}, voteCount: 0, resultsVisible: extra.resultsVisible === true, ...meta };
  }
  if (type === "points100") {
    const opts = (options && options.length >= 2 ? options : defaultOptions()).slice(0, 6);
    const sums = {};
    for (const o of opts) sums[o.id] = 0;
    return { id: uid(), type: "points100", question, options: opts, sums, voteCount: 0, resultsVisible: extra.resultsVisible === true, ...meta };
  }
  if (type === "open_text") {
    return { id: uid(), type: "open_text", question, entries: [], voteCount: 0, resultsVisible: extra.resultsVisible === true, ...meta };
  }
  if (type === "image_choice") {
    const opts = (options && options.length >= 2 ? options : defaultOptions()).slice(0, 6);
    const counts = {};
    for (const o of opts) counts[o.id] = 0;
    return { id: uid(), type: "image_choice", question, options: opts, counts, voteCount: 0, resultsVisible: extra.resultsVisible === true, ...meta };
  }
  if (type === "datetime") {
    const opts = (options && options.length >= 2 ? options : defaultOptions()).slice(0, 6);
    const counts = {};
    for (const o of opts) counts[o.id] = 0;
    return { id: uid(), type: "datetime", question, options: opts, counts, voteCount: 0, resultsVisible: extra.resultsVisible === true, ...meta };
  }
  if (type === "picker") {
    let opts = (options && options.length >= 10 ? options : defaultPickerOptions()).slice(0, 50);
    while (opts.length < 10) opts.push({ id: `o${opts.length + 1}`, label: `Option ${opts.length + 1}` });
    const counts = {};
    for (const o of opts) counts[o.id] = 0;
    const allowMultiple = extra.allowMultiple === true;
    let maxSelections = null;
    if (allowMultiple && extra.maxSelections != null) {
      maxSelections = Math.max(1, Math.min(opts.length, Number(extra.maxSelections) || 1));
    }
    return {
      id: uid(),
      type: "picker",
      question,
      subtitle: extra.subtitle || "",
      options: opts,
      categories: Array.isArray(extra.categories) ? extra.categories : [],
      allowMultiple,
      maxSelections,
      enableSearch: extra.enableSearch !== false && opts.length > 20 ? true : extra.enableSearch === true,
      showOptionIcons: extra.showOptionIcons !== false,
      layout: extra.layout || "list",
      counts,
      voteCount: 0,
      resultsVisible: extra.resultsVisible === true,
      ...meta,
    };
  }
  const opts = (options && options.length >= 2 ? options : defaultOptions()).slice(0, 6);
  const counts = {};
  for (const o of opts) counts[o.id] = 0;
  return { id: uid(), type: "choice", question, options: opts, counts, resultsVisible: extra.resultsVisible === true, ...meta };
}

function demoPayload(question) {
  return {
    type: "demo",
    question,
    slides: [
      buildSlide("choice", question || "Welches Thema sollen wir als Nächstes vertiefen?", [
        { id: "o1", label: "Performance" },
        { id: "o2", label: "UX & Typografie" },
        { id: "o3", label: "Echtzeit-Architektur" },
        { id: "o4", label: "Barrierefreiheit" },
      ], { resultsVisible: true }),
      buildSlide("wordcloud", "Ein Wort, das diesen Workshop beschreibt", undefined, { resultsVisible: true }),
      buildSlide("qa", "Welche Fragen habt ihr an das Podium?", undefined, { questions: demoQA() }),
      buildSlide("quiz", demoQuiz().question, demoQuiz().options, demoQuiz()),
      buildSlide("rating_scale", "Wie zufrieden sind Sie mit diesem Format?", undefined, { resultsVisible: true }),
    ],
  };
}

function demoQA() {
  return [
    { id: "1", text: "Wie wird KI in der Verwaltung eingesetzt?", upvotes: 23, status: "approved", authorId: "d1", authorName: "Alex", createdAt: Date.now() - 90000, voters: [] },
    { id: "2", text: "Gibt es Schulungen für neue Tools?", upvotes: 18, status: "pending", authorId: "d2", authorName: "Sam", createdAt: Date.now() - 60000, voters: [] },
    { id: "3", text: "Wann kommt das nächste Townhall?", upvotes: 15, status: "answered", authorId: "d3", authorName: "Kim", createdAt: Date.now() - 30000, voters: [] },
  ];
}

function demoQuiz() {
  return {
    question: "Welche Technologie nutzen wir für WebSocket?",
    options: [
      { id: "o1", label: "HTTP" },
      { id: "o2", label: "Socket.io" },
      { id: "o3", label: "FTP" },
      { id: "o4", label: "SMTP" },
    ],
    correct: 1,
    correctIndex: 1,
    duration: 30,
  };
}

function defaultQuestion(type) {
  if (type === "wordcloud") return "Welches Wort bleibt hängen?";
  if (type === "qa") return "Welche Fragen habt ihr an das Podium?";
  if (type === "rating_scale") return "Wie bewerten Sie das?";
  if (type === "ranking") return "Bitte sortiert die Optionen — Liebling zuerst";
  if (type === "points100") return "Verteilt 100 Punkte";
  if (type === "open_text") return "Was möchtet ihr mitgeben?";
  if (type === "image_choice") return "Welches Bild passt am besten?";
  if (type === "datetime") return "Wann passt es euch?";
  if (type === "picker") return "Wählen Sie eine Option";
  if (type === "demo") return "Welches Thema sollen wir als Nächstes vertiefen?";
  return "Was ist eure bevorzugte Option?";
}

function defaultOptions() {
  return [
    { id: "o1", label: "Option A" },
    { id: "o2", label: "Option B" },
  ];
}

function normalizeWord(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function randomDemoWord() {
  const pool = [
    "Klarheit", "Tempo", "Fokus", "Neugier", "Mut", "Flow", "Präzision",
    "Team", "Energie", "Humor", "Tiefe", "Struktur", "Impuls", "Weitblick",
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Stabile Teilnehmer-ID für Upvotes und Quiz-Punkte (lokal im Browser).
 */
function ensureClientId() {
  let id = sessionStorage.getItem("pulse:client-id");
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem("pulse:client-id", id);
  }
  api.clientId = id;
}

const TEAM_KEY = "pulse:team-name";

function storeTeamName(name) {
  try {
    localStorage.setItem(TEAM_KEY, String(name || "").slice(0, 40));
  } catch {
    /* ignore */
  }
}

function readTeamName() {
  if (!isJoinTeamEnabled()) return "";
  try {
    return localStorage.getItem(TEAM_KEY) || "";
  } catch {
    return "";
  }
}

/** Ob das optionale Teamname-Feld auf der Startseite aktiv ist (Branding). */
function isJoinTeamEnabled() {
  return Boolean(ctx.branding?.joinTeamEnabled);
}

/** Teamname-Feld auf der Startseite ein- oder ausblenden. */
function applyJoinTeamField(b) {
  const wrap = document.getElementById("join-team-wrap");
  if (!wrap) return;
  const enabled = Boolean(b?.joinTeamEnabled);
  wrap.hidden = !enabled;
  if (!enabled) {
    const input = document.getElementById("join-team");
    if (input) input.value = "";
  } else if (readTeamName()) {
    const input = document.getElementById("join-team");
    if (input && !input.value) input.value = readTeamName();
  }
}

/**
 * Hash #/qa bzw. #/quiz springt in der Demo direkt auf die passende Folie.
 */
function applyStartType(session) {
  const want = sessionStorage.getItem("pulse:start-type");
  if (!want || !session?.slides) return;
  sessionStorage.removeItem("pulse:start-type");
  const idx = session.slides.findIndex((s) => s.type === want);
  if (idx >= 0) session.activeSlideIndex = idx;
}

function mountQa(root, role, slide) {
  initQA(root, {
    role,
    clientId: api.clientId,
    moderated: slide.moderated !== false,
    onSubmit: (text, extra = {}) => {
      emitLive("submit_question", {
        code: ctx.session.code,
        slideId: slide.id,
        text,
        category: extra.category,
        private: extra.private,
        clientId: api.clientId,
      });
      if (role === "participant") hapticSuccess();
    },
    onUpvote: (id) => {
      emitLive("upvote_question", { code: ctx.session.code, questionId: id, clientId: api.clientId });
    },
    onModerate: (id, action) => {
      emitLive("moderate_question", { code: ctx.session.code, questionId: id, action });
    },
    onGroup: (keepId, mergeId) => {
      emitLive("moderate_question", {
        code: ctx.session.code,
        action: "group",
        keepId,
        mergeIds: [mergeId],
      });
    },
    onAnswer: (id, text) => {
      emitLive("moderate_question", { code: ctx.session.code, questionId: id, action: "answer_text", text });
    },
    onRefresh: () => {
      api.getQuestions(ctx.session.code, slide.id).then((res) => {
        if (res?.questions) {
          slide.questions = res.questions;
          updateQA(res.questions);
        }
      });
    },
  });
  updateQA(slide.questions || []);
  mountQaTimer(root, {
    role,
    t,
    defaultLimitSec: ctx.branding?.qaDefaultLimitSec ?? 60,
    snapshot: slide.qaTimer,
    onAction: (action, extra = {}) => {
      emitLive("qa_timer", {
        code: ctx.session.code,
        slideId: slide.id,
        action,
        limitSec: extra.limitSec,
        seconds: extra.seconds,
      });
    },
  });
  maybeAutoStartQaTimer(slide, role);
}

function mountQuiz(root, role, slide) {
  initQuiz(root, {
    role,
    options: slide.options || [],
    duration: slide.duration || 30,
    correctIndex: slide.correctIndex,
    correctIndexes: slide.correctIndexes,
    multiCorrect: slide.multiCorrect || (slide.correctIndexes && slide.correctIndexes.length > 1),
    onStart: (duration) => {
      emitLive("quiz_start", { code: ctx.session.code, questionId: slide.id, duration });
    },
    onAnswer: (answerIndexes, remaining) => {
      const indexes = Array.isArray(answerIndexes) ? answerIndexes : [answerIndexes];
      emitLive("quiz_answer", {
        code: ctx.session.code,
        questionId: slide.id,
        answerIndexes: indexes,
        answerIndex: indexes[0],
        remaining,
        clientId: api.clientId,
        teamName: readTeamName(),
      });
      if (role === "participant") {
        hapticSuccess();
        playBrandSound();
      }
    },
    onPowerup: (kind) => {
      emitLive("quiz_powerup", { code: ctx.session.code, slideId: slide.id, kind });
    },
    onOverall: () => {
      showOverallLeaderboard(ctx.session?.quizOverall || []);
    },
    onEnd: () => {
      emitLive("quiz_end", { code: ctx.session.code, questionId: slide.id });
    },
    onNext: () => shiftSlide(1),
    onTimeout: () => {
      if (role === "presenter" && !isLiveServer()) {
        emitLive("quiz_end", { code: ctx.session.code, questionId: slide.id });
      }
    },
  });
  if (slide.round?.status === "running") {
    startQuizRound(slide.round.startedAt, slide.round.duration || slide.duration);
  }
}

/** Nur WebSocket — REST würde dieselbe Aktion ein zweites Mal auslösen. */
function emitLive(type, payload) {
  ctx.rt?.send(type, payload);
}

/**
 * Präsentationsansicht rechts neben dem Presenter-Fenster öffnen (Screen-Share).
 */
function openStageWindow() {
  const code = ctx.session?.code;
  if (!code) return;
  const w = 1280;
  const h = 720;
  const left = Math.round((window.screenX || 0) + (window.outerWidth || 0));
  const top = Math.round(window.screenY || 0);
  const url = `${location.origin}${location.pathname}#/stage/${code}`;
  const win = window.open(url, `pulse-stage-${code}`, `popup=yes,width=${w},height=${h},left=${left},top=${top},noopener`);
  if (win) win.opener = null;
}

/**
 * Beim ersten Öffnen einer Q&A-Folie Timer starten, wenn das Limit aktiv ist.
 * Läuft nur einmal pro Folie und Session (kein Restart nach Pause/Ende).
 * @param {object} slide
 * @param {string} role
 */
function maybeAutoStartQaTimer(slide, role) {
  if (role !== "presenter" || slide?.type !== "qa") return;
  if (slide.interaction?.manualStart !== false) return;
  if (ctx.qaAutoStarted.has(slide.id)) return;
  const snap = slide.qaTimer || currentQaTimerSnapshot();
  const st = snap?.status;
  if (st === "running" || st === "paused" || st === "ended") {
    ctx.qaAutoStarted.add(slide.id);
    return;
  }
  if (!isQaTimerEnabled()) return;
  ctx.qaAutoStarted.add(slide.id);
  emitLive("qa_timer", {
    code: ctx.session.code,
    slideId: slide.id,
    action: "start",
    limitSec: qaTimerLimitSec(),
  });
}

function canHideSlide(slide) {
  return (
    slide &&
    (slide.type === "choice" ||
      slide.type === "rating_scale" ||
      slide.type === "wordcloud" ||
      slide.type === "ranking" ||
      slide.type === "points100" ||
      slide.type === "open_text" ||
      slide.type === "image_choice" ||
      slide.type === "datetime" ||
      slide.type === "picker")
  );
}

function renderLobby() {
  const countdownOn = syncPresentEventCountdown();
  const on = Boolean(ctx.session?.lobby) && !countdownOn;
  if (els.lobbyOverlay) els.lobbyOverlay.hidden = !on;
  if (els.presentQuestion) els.presentQuestion.hidden = on || countdownOn;
  if (els.resultsTeaser && (on || countdownOn)) els.resultsTeaser.hidden = true;
  refreshPresenterPanel();
}

/**
 * Event-Countdown in der Presenter-Stage. Presenter kann überspringen.
 * @returns {boolean}
 */
function syncPresentEventCountdown() {
  ensurePresentCountdownHost();
  const host = document.getElementById("present-event-countdown");
  const meta = ctx.session?.eventMeta;
  if (
    ctx.role !== "present" ||
    !host ||
    !shouldShowCountdown(meta, ctx.eventClockSkew, { skipped: ctx.eventCountdownSkipped })
  ) {
    presentCountdownCtl?.stop();
    presentCountdownCtl = null;
    if (host) host.hidden = true;
    return false;
  }
  if (!presentCountdownCtl) {
    presentCountdownCtl = mountCountdown(host, meta, {
      getSkew: () => ctx.eventClockSkew,
      showStart: true,
      startLabel: t("countdown.startNow"),
      continueLabel: t("countdown.continue"),
      syncEveryMs: 10_000,
      onSync: () => {
        try {
          ctx.rt?.send("ping", {});
        } catch {
          /* offline */
        }
      },
      onStart: () => requestEventCountdownStart("start_now"),
      onContinue: () => {},
      onEnded: () => {
        requestEventCountdownStart("ended");
      },
    });
  } else {
    presentCountdownCtl.refresh?.();
  }
  return true;
}

/** Presenter startet Event vorzeitig oder nach Countdown-Ablauf — serverseitig autoritativ. */
function requestEventCountdownStart(action) {
  const meta = ctx.session?.eventMeta;
  if (!meta?.startTime || !ctx.session?.code) return;
  const rem = remainingMs(meta.startTime, ctx.eventClockSkew);
  const SIGNIFICANT_EARLY_MS = 5 * 60 * 1000;
  if (action === "start_now" && rem > SIGNIFICANT_EARLY_MS) {
    const planned = new Date(Date.parse(meta.startTime)).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
    const now = new Date().toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    if (!window.confirm(t("countdown.confirmEarly", { planned, now }))) return;
  }
  ctx.eventCountdownSkipped = true;
  presentCountdownCtl?.stop();
  presentCountdownCtl = null;
  emitLive("event_countdown", { code: ctx.session.code, action });
  renderLobby();
  renderActiveSlide();
}

function ensurePresentCountdownHost() {
  const stage = document.getElementById("present-stage");
  if (!stage || document.getElementById("present-event-countdown")) return;
  const host = document.createElement("div");
  host.id = "present-event-countdown";
  host.hidden = true;
  stage.prepend(host);
}

function slideVoteCount(slide) {
  if (!slide) return 0;
  if (slide.voteCount != null) return slide.voteCount;
  if (slide.counts) return Object.values(slide.counts).reduce((a, n) => a + Number(n || 0), 0);
  if (slide.entries) return slide.entries.reduce((a, e) => a + Number(e.count || 0), 0);
  return 0;
}

function syncPresentResults() {
  const slide = currentSlide();
  const hide = canHideSlide(slide) && !slide.resultsVisible && !ctx.session?.lobby;
  if (els.resultsTeaser) els.resultsTeaser.hidden = !hide;
  const countEl = document.getElementById("results-teaser-count");
  if (hide && countEl) countEl.textContent = String(slideVoteCount(slide));
  if (els.btnResults) {
    els.btnResults.hidden = !canHideSlide(slide) || Boolean(ctx.session?.lobby);
    els.btnResults.textContent = slide?.resultsVisible ? t("results.hide") : t("results.show");
  }
  if (!hide && slide && ctx.role === "present" && slide.resultsVisible) {
    if (slide.type === "choice" && slide.counts) updatePollResults({ counts: slide.counts });
    if (slide.type === "rating_scale" && slide.counts) updateRatingResults({ counts: slide.counts });
    if (slide.type === "wordcloud") updateWordCloud(slide.entries || []);
    if (["ranking", "points100", "open_text", "image_choice", "datetime", "picker"].includes(slide.type)) {
      if (slide.type === "picker") {
        import("./picker.js").then(({ renderPickerResults }) => renderPickerResults(els.pollRoot, slide, { t }));
      } else renderTypedResults(els.pollRoot, slide, { t });
    }
  }
}

function toggleResults() {
  const slide = currentSlide();
  if (!canHideSlide(slide) || ctx.session?.lobby) return;
  const visible = !slide.resultsVisible;
  slide.resultsVisible = visible;
  emitLive("results", { code: ctx.session.code, slideId: slide.id, visible });
  if (ctx.rt?.mock) renderActiveSlide();
}

function setLobby(on) {
  if (!ctx.session) return;
  ctx.session.lobby = on;
  emitLive("lobby", { code: ctx.session.code, lobby: on });
  renderLobby();
  if (ctx.rt?.mock) persistLocal(ctx.session);
}

async function copyJoinLink() {
  if (ctx.session?.rehearsal) {
    if (els.btnCopyLink) els.btnCopyLink.textContent = t("present.joinDisabled");
    return;
  }
  const url = joinUrl(ctx.session?.code);
  try {
    await navigator.clipboard.writeText(url);
    if (els.btnCopyLink) els.btnCopyLink.textContent = t("present.copied");
    window.setTimeout(() => {
      if (els.btnCopyLink) els.btnCopyLink.textContent = t("present.copy");
    }, 1600);
  } catch {
    window.prompt(t("present.copy"), url);
  }
}

function sendReaction(emoji) {
  emitLive("reaction", { code: ctx.session?.code, emoji });
}

function rememberSession(session) {
  const first = session.slides?.[0]?.question || "";
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    list = [];
  }
  list = [{ code: session.code, question: first, at: Date.now() }, ...list.filter((x) => x.code !== session.code)].slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* Quota */
  }
}

function renderRecentSessions() {
  const root = document.getElementById("recent-sessions");
  const list = document.getElementById("recent-list");
  if (!root || !list) return;
  let items = [];
  try {
    items = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    items = [];
  }
  root.hidden = !items.length;
  list.replaceChildren();
  for (const item of items) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#/present/${item.code}`;
    const q = String(item.question || "").replace(/</g, "&lt;");
    a.innerHTML = `<strong>${formatCode(item.code)}</strong><span class="muted">${q}</span>`;
    li.append(a);
    list.append(li);
  }
}

function emitDeck(action, extra = {}) {
  if (!ctx.session) return;
  emitLive("deck", { action, ...extra, code: ctx.session.code });
}

function applyDeckEvent(payload) {
  if (!ctx.session || !payload) return;
  if (Array.isArray(payload.slides)) {
    const prev = new Map((ctx.session.slides || []).map((s) => [s.id, s]));
    ctx.session.slides = payload.slides.map((s) => ({ ...(prev.get(s.id) || {}), ...s }));
    ctx.session.activeSlideIndex = payload.activeSlideIndex ?? 0;
    if (ctx.role === "join") stripPresenterSecrets(ctx.session);
    persistLocal(ctx.session);
    if (ctx.role === "present") renderActiveSlide();
    else if (ctx.role === "join") renderJoinSlide();
    return;
  }
  if (payload.action && ctx.rt?.mock) {
    applyMockDeck(ctx.session, payload, (raw) => {
      const src = raw.slide || raw;
      return buildSlide(src.type, src.question, src.options, src);
    });
    persistLocal(ctx.session);
    if (ctx.role === "present") renderActiveSlide();
    else if (ctx.role === "join") renderJoinSlide();
  }
}

function openSlideDialog() {
  const q = document.getElementById("slide-add-question");
  if (q) q.value = "";
  syncSlideAddOptions();
  els.slideDialog?.showModal();
}

function syncSlideAddOptions() {
  const type = document.getElementById("slide-add-type")?.value;
  const wrap = document.getElementById("slide-add-options-wrap");
  const needs =
    type === "choice" ||
    type === "quiz" ||
    type === "ranking" ||
    type === "points100" ||
    type === "image_choice" ||
    type === "datetime" ||
    type === "picker";
  if (wrap) wrap.hidden = !needs;
}

function onAddLiveSlide(ev) {
  ev.preventDefault();
  const type = document.getElementById("slide-add-type")?.value || "choice";
  const question = document.getElementById("slide-add-question")?.value.trim() || defaultQuestion(type);
  let options = (document.getElementById("slide-add-options")?.value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label, i) => ({ id: `o${i + 1}`, label }));
  if (type === "picker" && options.length < 10) options = defaultPickerOptions();
  const slide = buildSlide(type, question, options.length ? options : undefined, {
    correctIndexes: [0],
    correctIndex: 0,
    duration: 30,
    notes: document.getElementById("slide-add-notes")?.value || "",
    plannedMinutes: document.getElementById("slide-add-planned")?.value,
  });
  els.slideDialog?.close();
  emitDeck("add", { slide });
}

function onQuizStarted(payload) {
  const slide =
    ctx.session?.slides.find((s) => s.id === payload.slideId || s.id === payload.questionId) || currentSlide();
  if (!slide || slide.type !== "quiz") return;
  slide.round = {
    status: "running",
    startedAt: payload.startedAt || Date.now(),
    duration: payload.duration || slide.duration || 30,
    answers: {},
  };
  if (currentSlide()?.type === "quiz") startQuizRound(slide.round.startedAt, slide.round.duration);
}

function applyQuizResults(payload) {
  if (currentSlide()?.type !== "quiz") return;
  const you = payload.leaderboard?.find((r) => r.id === api.clientId || r.id === readTeamName());
  showQuizResults({
    ...payload,
    you: you ? { ...you, correct: you.lastDelta > 0, points: you.lastDelta } : { correct: false, points: 0 },
  });
  if (payload.overall) {
    ctx.session.quizOverall = payload.overall;
    showOverallLeaderboard(payload.overall);
  }
}

function applyMockQuestion(payload) {
  if (!ctx.rt?.mock || ctx.role !== "present") return;
  const slide = ctx.session?.slides.find((s) => s.id === payload.slideId && s.type === "qa") ||
    ctx.session?.slides.find((s) => s.type === "qa");
  if (!slide) return;
  const q = {
    id: uid(),
    text: String(payload.text || "").trim().slice(0, 500),
    upvotes: 0,
    status: "pending",
    authorId: payload.clientId || "mock",
    authorName: "Teilnehmer",
    createdAt: Date.now(),
    voters: [],
    category: payload.category || "other",
    private: payload.private === true,
  };
  if (!q.text) return;
  ctx.rt.send("new_question", q);
}

function applyMockUpvote(payload) {
  if (!ctx.rt?.mock || ctx.role !== "present") return;
  const slide = ctx.session?.slides.find((s) => s.type === "qa");
  const q = slide?.questions?.find((item) => item.id === payload.questionId);
  if (!q) return;
  q.voters = q.voters || [];
  const voter = payload.clientId || "mock";
  if (q.voters.includes(voter)) return;
  q.voters.push(voter);
  q.upvotes += 1;
  ctx.rt.send("question_upvoted", { questionId: q.id, count: q.upvotes, voterId: voter, question: q });
}

function applyMockModerate(payload) {
  if (!ctx.rt?.mock || ctx.role !== "present") return;
  const map = { approve: "approved", hide: "hidden", answer: "answered" };
  const status = map[payload.action];
  if (!status) return;
  ctx.rt.send("question_moderated", { questionId: payload.questionId, status });
}

function applyMockQuizAnswer(payload) {
  if (!ctx.rt?.mock || ctx.role !== "present") return;
  const slide = ctx.session?.slides.find((s) => s.type === "quiz") || currentSlide();
  if (!slide || slide.type !== "quiz") return;
  slide.round = slide.round || { status: "running", answers: {} };
  slide.round.answers = slide.round.answers || {};
  const id = payload.clientId || "mock";
  if (slide.round.answers[id]) return;
  slide.round.answers[id] = {
    index: payload.answerIndex,
    indexes: Array.isArray(payload.answerIndexes) ? payload.answerIndexes : [payload.answerIndex],
    remaining: payload.remaining,
    name: payload.teamName || `Teilnehmer ${String(id).slice(0, 2).toUpperCase()}`,
    team: payload.teamName || "",
  };
}

function finishMockQuiz() {
  const slide = ctx.session?.slides.find((s) => s.type === "quiz") || currentSlide();
  if (!slide || slide.type !== "quiz") return;
  if (slide.round?.status === "ended" && slide.round.lastResults) {
    ctx.rt?.send("quiz_results", slide.round.lastResults);
    ctx.rt?.send("leaderboard_update", { top10: slide.round.lastResults.leaderboard });
    return;
  }
  slide.round = slide.round || { duration: slide.duration || 30, answers: {} };
  slide.round.status = "ended";
  slide.scores = slide.scores || {};
  const total = slide.round.duration || slide.duration || 30;
  for (const [id, ans] of Object.entries(slide.round.answers || {})) {
    const picked = Array.isArray(ans.indexes) ? ans.indexes : [ans.index];
    const correctSet = Array.isArray(slide.correctIndexes) ? slide.correctIndexes : [slide.correctIndex];
    const correct =
      picked.length === correctSet.length && [...picked].sort().every((v, i) => v === [...correctSet].sort()[i]);
    const points = correct ? Math.round(500 + 500 * ((ans.remaining || 0) / total)) : 0;
    const prev = slide.scores[id] || { name: ans.name, points: 0 };
    prev.name = ans.name;
    prev.lastDelta = points;
    prev.points += points;
    slide.scores[id] = prev;
  }
  const leaderboard = Object.entries(slide.scores)
    .map(([id, s]) => ({ id, name: s.name, points: s.points, lastDelta: s.lastDelta || 0 }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 10)
    .map((row, i) => ({ ...row, rank: i + 1 }));
  const payload = { slideId: slide.id, correctAnswer: slide.correctIndex, correctIndexes: slide.correctIndexes || [slide.correctIndex], leaderboard };
  slide.round.lastResults = payload;
  ctx.rt?.send("quiz_results", payload);
  ctx.rt?.send("leaderboard_update", { top10: leaderboard });
}

function patchQuestion(q, isNew) {
  const slide = ctx.session?.slides.find((s) => s.type === "qa") || currentSlide();
  if (!slide || slide.type !== "qa" || !q?.id) return;
  slide.questions = slide.questions || [];
  const i = slide.questions.findIndex((item) => item.id === q.id);
  if (i >= 0) slide.questions[i] = { ...slide.questions[i], ...q };
  else if (isNew) slide.questions.push(q);
  persistLocal(ctx.session);
  refreshQaView();
  refreshPresenterPanel();
}

function refreshQaView() {
  const slide = currentSlide();
  if (slide?.type === "qa") {
    updateQA(slide.questions || []);
    if (els.moderationPanel && !els.moderationPanel.hidden) {
      renderModeration(els.moderationPanel, slide.questions || [], {
        onModerate: (id, action) => emitLive("moderate_question", { code: ctx.session.code, questionId: id, action }),
        onBulk: (action, ids) => ids.forEach((id) => emitLive("moderate_question", { code: ctx.session.code, questionId: id, action })),
      });
    }
  }
}

function toggleModeration() {
  if (!els.moderationPanel) return;
  els.moderationPanel.hidden = !els.moderationPanel.hidden;
  refreshQaView();
}

function qaQuestions() {
  const slide = ctx.session?.slides.find((s) => s.type === "qa");
  return slide?.questions || [];
}

async function exportQaCsv() {
  const code = ctx.session?.code || "local";
  let csv = "";
  if (isLiveServer() && code) csv = await api.exportCsv(code, "qa");
  if (!csv) csv = questionsToCsv(qaQuestions(), code);
  downloadText(`qa-${code}.csv`, csv);
}

function exportQaPdf() {
  const slide = ctx.session?.slides.find((s) => s.type === "qa");
  printQuestionsPdf(qaQuestions(), { code: ctx.session?.code, question: slide?.question });
}

/**
 * Event-Farben/Logo überschreiben das Instanz-Branding nur in Join/Presenter.
 * Leere Event-Felder lassen die Instanz-Werte stehen.
 */
function applyEventBrandingOverlay(session) {
  const base = ctx.instanceBranding || ctx.branding || {};
  const overlay = session?.eventBranding;
  if (!overlay) {
    applyBranding(base);
    return;
  }
  applyBranding({
    ...base,
    primary: overlay.primary || base.primary,
    secondary: overlay.secondary || base.secondary,
    logo: overlay.logo || base.logo,
    footerText: overlay.footerText || base.footerText,
  });
}

function applyBranding(b) {
  if (!b) return;
  const root = document.documentElement;
  if (b.primary) root.style.setProperty("--primary-color", b.primary);
  if (b.secondary) root.style.setProperty("--secondary-color", b.secondary);
  if (b.bg) root.style.setProperty("--bg-color", b.bg);
  if (b.text) root.style.setProperty("--text-color", b.text);
  /* Branding-Farben erst nach dem Setzen gegen WCAG prüfen und ggf. Theme-Fallbacks nutzen. */
  applyBrandingContrast();
  try {
    applyCustomFont(b.customFont || "");
  } catch {
    applyCustomFont("");
  }
  try {
    applySlideBackground(b.slideBackground || "");
  } catch {
    applySlideBackground("");
  }
  const transition = b.slideTransition === "none" || b.slideTransition === "fade" || b.slideTransition === "slide" ? b.slideTransition : "slide";
  const stage = document.getElementById("present-stage");
  if (stage) stage.setAttribute("data-transition", transition);

  applyWhiteLabel(b);

  applyJoinTeamField(b);

  const logoUrl = typeof b.logo === "string" ? b.logo.trim() : "";
  const hasLogo =
    logoUrl.length > 0 && (logoUrl.startsWith("data:") || /^https?:\/\//i.test(logoUrl));
  const logos = [
    document.getElementById("brand-logo-home"),
    document.getElementById("brand-logo-admin"),
    document.getElementById("footer-logo"),
    document.getElementById("brand-logo-preview"),
  ];
  logos.forEach((img) => {
    if (!img) return;
    if (hasLogo) {
      img.src = logoUrl;
      img.hidden = false;
      img.alt = String(b.appName || "Pulse").trim() || "Pulse";
    } else {
      img.removeAttribute("src");
      img.hidden = true;
      img.alt = "";
    }
  });
  /* Monogramm nur ohne Bild-Logo — sonst doppelte Markenführung in der Kopfzeile. */
  document.querySelectorAll("[data-brand-mono]").forEach((el) => {
    el.hidden = hasLogo;
  });
  const copy = document.getElementById("footer-copy");
  if (copy && b.footerText) copy.innerHTML = simpleMarkdown(b.footerText);
  const imprint = document.getElementById("footer-imprint");
  const privacy = document.getElementById("footer-privacy");
  /* Footer-Links: interne Hash-Route oder externe http(s)-URL aus dem Branding. */
  const setLegalTarget = (el, url, fallbackHash) => {
    if (!el) return;
    const u = String(url || "").trim();
    if (/^https?:\/\//i.test(u)) {
      el.setAttribute("href", u);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
      return;
    }
    el.setAttribute("href", fallbackHash);
    el.removeAttribute("target");
    el.removeAttribute("rel");
  };
  setLegalTarget(imprint, b.impressumUrl, "#/impressum");
  setLegalTarget(privacy, b.privacyUrl, "#/privacy");
  /* Ein Footer-Link zur Homepage der verantwortlichen Stelle — nur bei gültiger http(s)-URL. */
  const homeNav = document.getElementById("footer-home");
  const homeLink = document.getElementById("footer-home-link");
  const homepageUrl = typeof b.homepageUrl === "string" ? b.homepageUrl.trim() : "";
  const homepageOk = /^https?:\/\//i.test(homepageUrl);
  if (homeNav) homeNav.hidden = !homepageOk;
  if (homeLink) {
    homeLink.href = homepageOk ? homepageUrl : "#";
    homeLink.rel = "noopener noreferrer";
    homeLink.target = "_blank";
    homeLink.textContent = t("footer.home");
  }
  const ret = document.getElementById("footer-retention");
  if (ret) {
    ret.textContent = b.retentionDays
      ? t("footer.retention", { n: b.retentionDays })
      : t("footer.retentionNever");
  }
  ctx.branding = b;
}

/**
 * App-Name, Favicon, Footer-Sichtbarkeit. Interner Speicher (pulse.db / pulse:*) bleibt.
 * @param {object} b
 */
function applyWhiteLabel(b) {
  const name = String(b.appName || "Pulse").trim() || "Pulse";
  const mono = brandMonogram(name);
  document.title = `${name} — Live-Interaktion`;
  document.querySelectorAll("[data-brand-name]").forEach((el) => {
    el.textContent = name;
  });
  document.querySelectorAll("[data-brand-mono]").forEach((el) => {
    el.textContent = mono;
  });
  const icon = document.getElementById("favicon");
  if (icon) {
    try {
      if (b.favicon) {
        icon.href = b.favicon;
        icon.type = /svg/i.test(b.favicon) ? "image/svg+xml" : "image/png";
      } else {
        icon.href = "./assets/favicon.svg";
        icon.type = "image/svg+xml";
      }
    } catch {
      /* Ungültige Data-URL: Standard-Favicon lassen */
    }
  }
  const footer = document.getElementById("app-footer");
  const hidden = Boolean(b.footerHidden);
  if (footer) footer.hidden = hidden;
  document.body.classList.toggle("footer-hidden", hidden);
  const discreet = document.getElementById("legal-hash-link");
  if (discreet) discreet.hidden = !hidden;
}

/** Kürzel für das Logo-Zeichen, Default „Pu“ für Pulse. */
function brandMonogram(name) {
  const parts = String(name || "Pulse")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const s = (parts[0] || "Pu").replace(/[^A-Za-z0-9ÄÖÜäöüß]/g, "");
  return (s.slice(0, 2) || "Pu").toUpperCase();
}

const SOUND_MUTE_DEFAULT = true;

function isSoundMuted() {
  try {
    const v = localStorage.getItem(SOUND_MUTE_KEY);
    if (v == null) return SOUND_MUTE_DEFAULT;
    return v !== "0";
  } catch {
    return true;
  }
}

function setSoundMuted(muted) {
  try {
    localStorage.setItem(SOUND_MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* Privatmodus */
  }
  syncSoundToggles();
}

function toggleSoundMute() {
  setSoundMuted(!isSoundMuted());
}

function syncSoundToggles() {
  const muted = isSoundMuted();
  document.querySelectorAll("[data-sound-toggle]").forEach((btn) => {
    btn.setAttribute("aria-pressed", muted ? "true" : "false");
    btn.setAttribute("aria-label", muted ? t("sound.muteOn") : t("sound.muteOff"));
    btn.title = muted ? t("sound.enable") : t("sound.disable");
    const mark = btn.querySelector("span");
    if (mark) mark.textContent = muted ? "🔇" : "🔊";
  });
}

/**
 * Kurzer Cue nach Stimme/Quiz — nur nach User-Geste, Standard stumm.
 */
function playBrandSound() {
  if (isSoundMuted()) return;
  const url = ctx.branding?.sound;
  if (!url) return;
  try {
    const audio = new Audio(url);
    audio.volume = 0.45;
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* Codec/Autoplay: Abstimmung bleibt gültig */
  }
}

function renderLangSwitch() {
  const langs = ctx.branding?.languages || ["de", "en", "fr"];
  const flags = { de: "🇩🇪", en: "🇬🇧", fr: "🇫🇷" };
  for (const id of ["lang-switch", "lang-switch-present", "lang-switch-admin"]) {
    const host = document.getElementById(id);
    if (!host) continue;
    host.innerHTML = "";
    langs.forEach((code) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = flags[code] || code;
      btn.setAttribute("aria-label", t("lang." + code));
      btn.setAttribute("aria-pressed", currentLang() === code ? "true" : "false");
      btn.addEventListener("click", () => setLang(code).then(() => {
        renderLangSwitch();
        refreshDraftList();
        if (ctx.role === "present") renderActiveSlide();
        else if (ctx.role === "join") renderJoinSlide();
      }));
      host.append(btn);
    });
  }
}

function showConsentIfNeeded() {
  const raw = localStorage.getItem("tt:consent");
  if (raw) {
    try {
      const until = JSON.parse(raw).until;
      if (until > Date.now()) return;
    } catch {
      /* show again */
    }
  }
  const box = document.getElementById("consent-dialog");
  if (box) box.hidden = false;
}

function acceptConsent() {
  localStorage.setItem("tt:consent", JSON.stringify({ until: Date.now() + 90 * 24 * 60 * 60 * 1000 }));
  const box = document.getElementById("consent-dialog");
  if (box) box.hidden = true;
}

function bindBrandingForm(initial) {
  const form = document.getElementById("branding-form");
  if (!form) return;
  const msg = document.getElementById("branding-msg");
  const setMsg = (text) => {
    if (msg) msg.textContent = text || "";
  };
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? "" : String(value);
  };
  const setCheck = (id, on) => {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(on);
  };
  const fill = (b) => {
    if (!b) return;
    setVal("brand-primary", b.primary || "#007CC1");
    setVal("brand-secondary", b.secondary || "#F99700");
    setVal("brand-bg", b.bg || "#ffffff");
    setVal("brand-footer", b.footerText || "");
    /* Datenschutz-URLs und Betriebsfelder liegen auf eigenen Seiten — nicht hier überschreiben. */
    setVal("brand-homepage-url", b.homepageUrl || "");
    setVal("brand-app-name", b.appName || "Pulse");
    setVal("brand-custom-domain", b.customDomain || "");
    setCheck("brand-footer-hidden", b.footerHidden);
    setCheck("brand-stage-logo", b.stageShowLogo);
    setCheck("brand-stage-footer", b.stageShowFooter);
    setCheck("brand-join-team-enabled", b.joinTeamEnabled);
    setVal("brand-transition", b.slideTransition || "slide");
    form.querySelectorAll("input[name=lang]").forEach((c) => {
      c.checked = (b.languages || ["de"]).includes(c.value);
    });
    form._logo = b.logo || "";
    form._customFont = b.customFont || "";
    form._slideBackground = b.slideBackground || "";
    form._sound = b.sound || "";
    form._favicon = b.favicon || "";
  };
  fill(initial);

  const bindDataUrl = (inputId, key, maxBytes, preview) => {
    document.getElementById(inputId)?.addEventListener("change", (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      if (file.size > maxBytes) {
        setMsg(t("branding.fileTooBig", { n: Math.round(maxBytes / 1024) }));
        ev.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        form[key] = reader.result;
        if (preview) {
          preview.src = reader.result;
          preview.hidden = false;
        }
        setMsg("");
      };
      reader.readAsDataURL(file);
    });
  };
  bindDataUrl("brand-logo-file", "_logo", 256 * 1024, document.getElementById("brand-logo-preview"));
  bindDataUrl("brand-font-file", "_customFont", 500 * 1024);
  bindDataUrl("brand-slide-bg-file", "_slideBackground", 512 * 1024);
  bindDataUrl("brand-sound-file", "_sound", 200 * 1024);
  bindDataUrl("brand-favicon-file", "_favicon", 64 * 1024);
  document.getElementById("brand-font-clear")?.addEventListener("click", () => {
    form._customFont = "";
    const el = document.getElementById("brand-font-file");
    if (el) el.value = "";
  });
  document.getElementById("brand-slide-bg-clear")?.addEventListener("click", () => {
    form._slideBackground = "";
    const el = document.getElementById("brand-slide-bg-file");
    if (el) el.value = "";
  });
  document.getElementById("brand-sound-clear")?.addEventListener("click", () => {
    form._sound = "";
    const el = document.getElementById("brand-sound-file");
    if (el) el.value = "";
  });
  document.getElementById("brand-favicon-clear")?.addEventListener("click", () => {
    form._favicon = "";
    const el = document.getElementById("brand-favicon-file");
    if (el) el.value = "";
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!(await ensureStepUp())) return;
    /* Nur Felder dieser Seite — Teilspeicherung merged serverseitig mit dem Bestand. */
    const languages = [...form.querySelectorAll("input[name=lang]:checked")].map((c) => c.value);
    const branding = await api.saveBranding({
      primary: document.getElementById("brand-primary")?.value,
      secondary: document.getElementById("brand-secondary")?.value,
      bg: document.getElementById("brand-bg")?.value,
      footerText: document.getElementById("brand-footer")?.value,
      homepageUrl: document.getElementById("brand-homepage-url")?.value.trim() || "",
      languages,
      logo: form._logo || "",
      appName: document.getElementById("brand-app-name")?.value.trim() || "Pulse",
      customDomain: document.getElementById("brand-custom-domain")?.value.trim() || "",
      footerHidden: Boolean(document.getElementById("brand-footer-hidden")?.checked),
      stageShowLogo: Boolean(document.getElementById("brand-stage-logo")?.checked),
      stageShowFooter: Boolean(document.getElementById("brand-stage-footer")?.checked),
      joinTeamEnabled: Boolean(document.getElementById("brand-join-team-enabled")?.checked),
      customFont: form._customFont || "",
      slideBackground: form._slideBackground || "",
      slideTransition: document.getElementById("brand-transition")?.value || "slide",
      sound: form._sound || "",
      favicon: form._favicon || "",
    });
    applyBranding(branding?.branding || branding);
    renderLangSwitch();
    setMsg(t("branding.saved"));
  });
  bindSettingsOpsForm(initial);
}

/**
 * Betriebs-Einstellungen (Intervall, Q&A-Limit, Wortfilter) — eigenes Menü.
 * @param {object} [initial]
 */
function bindSettingsOpsForm(initial) {
  const form = document.getElementById("settings-ops-form");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";
  const fill = (b) => {
    if (!b) return;
    const iEl = document.getElementById("brand-interval");
    if (iEl) iEl.value = String(b.questionIntervalSec || 30);
    const qaLimit = document.getElementById("brand-qa-limit");
    if (qaLimit) qaLimit.value = String(b.qaDefaultLimitSec ?? 60);
    const wf = document.getElementById("brand-wordfilter");
    if (wf) wf.checked = b.wordFilter !== false;
    const extra = document.getElementById("brand-extra-words");
    if (extra) extra.value = (b.extraWords || []).join(", ");
  };
  fill(initial);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!(await ensureStepUp())) return;
    const extraWords = (document.getElementById("brand-extra-words")?.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const branding = await api.saveBranding({
      questionIntervalSec: Number(document.getElementById("brand-interval")?.value) || 30,
      qaDefaultLimitSec: Number(document.getElementById("brand-qa-limit")?.value),
      wordFilter: Boolean(document.getElementById("brand-wordfilter")?.checked),
      extraWords,
    });
    applyBranding(branding?.branding || branding);
    const msg = document.getElementById("settings-ops-msg");
    if (msg) msg.textContent = t("settings.opsSaved");
  });
}

/* Wortwolke wird lazy geladen — initWordCloud ist kein Binding dieses Moduls. */
export { drawQrCode };
export { initPoll, updatePollResults, updateWordCloud };
