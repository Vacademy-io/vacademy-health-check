/**
 * Store copy generator (§17) and review-notes generator (§18).
 *
 * Deliberately deterministic and offline: it drafts from what the record already knows — the app's
 * own description, the client name, the questionnaire answers — plus, optionally, text scraped
 * from the app's public website. Nothing here is ever submitted automatically; the output lands in
 * an editable box the user has to read and approve (§17).
 */

import { PLATFORM_QUESTIONS } from "@/lib/platform-requirements";
import {
  STORE_LABELS,
  type AppRecord,
  type Platform,
  type ReviewInfo,
  type StoreContent,
} from "@/types/app-registry";

/** Per-store copy budgets. Exceeding these is a hard rejection, not a warning. */
export const COPY_LIMITS: Record<Platform, { short: number; full: number; whatsNew: number }> = {
  ANDROID: { short: 80, full: 4000, whatsNew: 500 },
  IOS: { short: 30, full: 4000, whatsNew: 4000 },
  WINDOWS: { short: 1000, full: 10000, whatsNew: 1500 },
  MACOS: { short: 30, full: 4000, whatsNew: 4000 },
};

export const SHORT_FIELD_NAME: Record<Platform, string> = {
  ANDROID: "Short description",
  IOS: "Subtitle",
  WINDOWS: "Short description",
  MACOS: "Subtitle",
};

/* ------------------------------------------------------------ website fetch */

export interface WebsiteSummary {
  title: string;
  description: string;
  headings: string[];
  paragraphs: string[];
}

export interface WebsiteFetchResult {
  summary: WebsiteSummary | null;
  error: string | null;
}

/**
 * Best-effort read of the app's public marketing site.
 *
 * Most sites don't send `Access-Control-Allow-Origin`, so a browser fetch is blocked more often
 * than not. That's expected — the generator produces perfectly good copy without it, and the
 * caller shows a plain explanation instead of a stack trace. A server-side fetcher (behind
 * `APP_REGISTRY/fetch-site`) is the fix when this matters enough.
 */
export async function fetchWebsiteSummary(url: string): Promise<WebsiteFetchResult> {
  if (!url.trim()) return { summary: null, error: "No website URL on this app." };
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return { summary: null, error: `The site returned HTTP ${response.status}.` };
    const html = await response.text();
    return { summary: parseHtml(html), error: null };
  } catch {
    return {
      summary: null,
      error:
        "The browser couldn't read that site directly (its CORS policy blocks cross-origin reads). The draft below was written from the app details instead — edit it as needed.",
    };
  }
}

function parseHtml(html: string): WebsiteSummary {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const meta = doc.querySelector('meta[name="description"], meta[property="og:description"]');
  const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

  return {
    title: text(doc.querySelector("title") ?? doc.createElement("title")),
    description: meta?.getAttribute("content")?.trim() ?? "",
    headings: Array.from(doc.querySelectorAll("h1, h2, h3")).map(text).filter(Boolean).slice(0, 12),
    paragraphs: Array.from(doc.querySelectorAll("p"))
      .map(text)
      .filter((p) => p.length > 60)
      .slice(0, 10),
  };
}

/* -------------------------------------------------------------- generation */

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/** Feature bullets inferred from what the app has actually declared, not from a fixed template. */
function inferFeatures(app: AppRecord, platform: Platform): string[] {
  const answers = app.platforms[platform].answers;
  const yes = (id: string) => answers[id] === "YES";
  const features: string[] = [];

  features.push("Courses, lessons and study material in one place");
  features.push("Learn on your own schedule — start, pause and resume any lesson");
  if (yes("account_creation")) features.push("Secure personal account with your own progress history");
  if (yes("requires_login")) features.push("Everything synced to your account across devices");
  if (yes("paid_digital_content")) features.push("Enrol in paid courses and batches directly in the app");
  if (yes("user_generated_content")) features.push("Ask questions and get answers from your faculty");
  features.push("Live classes, recordings and downloadable notes");
  features.push("Practice tests with instant results and detailed solutions");
  features.push("Progress tracking so you always know what's left to cover");

  return features;
}

/** Pulls whatever useful sentences the website gave us, cleaned up. */
function siteHighlights(site: WebsiteSummary | null): string[] {
  if (!site) return [];
  return [...site.headings, ...site.paragraphs]
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 25 && s.length < 220)
    .slice(0, 6);
}

export interface GenerateOptions {
  app: AppRecord;
  platform: Platform;
  site?: WebsiteSummary | null;
  /** Version string used in the What's New draft. */
  version?: string;
}

export function generateStoreContent({ app, platform, site, version }: GenerateOptions): StoreContent {
  const limits = COPY_LIMITS[platform];
  const name = app.basics.displayName || app.basics.name || "the app";
  const client = app.basics.client || app.basics.developerName || "your institute";
  const base = app.basics.description.trim() || site?.description?.trim() || "";
  const features = inferFeatures(app, platform);
  const highlights = siteHighlights(site ?? null);

  const shortSeed =
    app.basics.shortDescription.trim() ||
    site?.description?.trim() ||
    `Learn with ${client} — courses, live classes and tests`;

  const openingLines = base
    ? base
    : `${name} is the official learning app from ${client}. Everything your course includes — video lessons, live classes, notes and practice tests — sits in one place, ready whenever you are.`;

  const fullParts = [
    openingLines,
    "",
    "WHAT YOU GET",
    ...features.map((f) => `• ${f}`),
  ];

  if (highlights.length) {
    fullParts.push("", "ABOUT " + client.toUpperCase(), ...highlights.map((h) => `• ${h}`));
  }

  fullParts.push(
    "",
    "WHO IT'S FOR",
    `Students enrolled with ${client}, and anyone who wants structured, exam-focused preparation they can carry in their pocket.`,
    "",
    "SUPPORT",
    app.basics.supportEmail ? `Questions? Write to ${app.basics.supportEmail}.` : "Questions? Reach us from the Help section inside the app.",
    app.basics.privacyPolicyUrl ? `Privacy policy: ${app.basics.privacyPolicyUrl}` : ""
  );

  const full = truncate(fullParts.filter((p) => p !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim(), limits.full);

  const whatsNew = truncate(
    [
      version ? `What's new in ${version}` : "What's new in this release",
      "",
      "• Faster load times across course and lesson screens",
      "• Fixes for playback and download reliability",
      "• Small design and stability improvements",
      "",
      app.basics.supportEmail ? `Found a problem? Tell us at ${app.basics.supportEmail}.` : "",
    ]
      .join("\n")
      .trim(),
    limits.whatsNew
  );

  return {
    shortDescription: truncate(shortSeed, limits.short),
    fullDescription: full,
    whatsNew,
    reviewNotes: generateReviewNotes(app, platform),
    accessInstructions: generateAccessInstructions(app, platform),
    keywords: generateKeywords(app),
    generatedAt: new Date().toISOString(),
    approved: false,
  };
}

/** 100-character comma-separated keyword string for Apple; also useful as Play tags. */
export function generateKeywords(app: AppRecord): string {
  const words = new Set<string>();
  const push = (w: string) => {
    const clean = w.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    if (clean.length > 2 && clean.length < 20) words.add(clean);
  };

  (app.basics.client || "").split(/\s+/).forEach(push);
  push("learning");
  push("courses");
  push("live classes");
  push("mock test");
  push("study");
  push("exam prep");
  push("notes");
  push("lms");

  // Apple counts the commas, so pack the string right up to 100 characters and stop.
  let out = "";
  for (const w of words) {
    const next = out ? `${out},${w}` : w;
    if (next.length > 100) break;
    out = next;
  }
  return out;
}

/* ------------------------------------------------------ review notes (§18) */

export function generateReviewNotes(app: AppRecord, platform: Platform): string {
  const r = app.review;
  const answers = app.platforms[platform].answers;
  const yes = (id: string) => answers[id] === "YES";
  const name = app.basics.displayName || app.basics.name || "This app";
  const store = STORE_LABELS[platform];

  const lines: string[] = [
    `Review notes for ${name} — ${store}`,
    "",
    `${name} is the official learning app for ${app.basics.client || app.basics.developerName}. Students use it to take the courses, live classes and tests their institute has enrolled them in.`,
    "",
  ];

  if (yes("requires_login") || r.username) {
    lines.push(
      "DEMO ACCOUNT",
      r.username ? `Username: ${r.username}` : "Username: (add one — the review will fail without it)",
      r.password ? `Password: ${r.password}` : "Password: (add one)",
      r.demoAccount ? `Account notes: ${r.demoAccount}` : "",
      "",
      "HOW TO SIGN IN",
      r.loginInstructions ||
        "Open the app, tap Login, enter the username and password above, and tap Sign in. The account is pre-enrolled in a sample course so content is visible immediately.",
      ""
    );
  } else {
    lines.push("ACCESS", "No login is required — all content is reachable straight from the home screen.", "");
  }

  if (r.navigationInstructions) {
    lines.push("WHERE TO LOOK", r.navigationInstructions, "");
  }

  if (yes("paid_digital_content")) {
    lines.push(
      "PURCHASES",
      r.subscriptionInstructions ||
        "Paid courses are sold by the institute. The demo account already has full access, so no purchase is needed to review the app.",
      r.testPaymentInstructions ? `Test payments: ${r.testPaymentInstructions}` : "",
      ""
    );
  }

  if (yes("user_generated_content")) {
    lines.push(
      "USER-GENERATED CONTENT",
      "Students can post doubts and comments. Content is moderated by institute staff, users can report content and block other users from the same screen, and the support address below is monitored.",
      ""
    );
  }

  if (yes("account_creation")) {
    lines.push(
      "ACCOUNT DELETION",
      app.privacy.accountDeletionUrl
        ? `Users can delete their account in-app under Profile → Settings → Delete account, and from ${app.privacy.accountDeletionUrl}.`
        : "Users can delete their account in-app under Profile → Settings → Delete account.",
      ""
    );
  }

  if (r.specialFeatures) lines.push("NOTABLE FEATURES", r.specialFeatures, "");
  if (r.restrictedFeatures) lines.push("NOT AVAILABLE TO THIS ACCOUNT", r.restrictedFeatures, "");

  lines.push(
    "CONTACT",
    r.contactInformation ||
      [app.basics.supportEmail, app.basics.supportPhone].filter(Boolean).join(" · ") ||
      "Add a contact for the reviewer.",
    "",
    "Thank you for reviewing the app — we're happy to supply anything else you need."
  );

  return lines.filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function generateAccessInstructions(app: AppRecord, platform: Platform): string {
  const answers = app.platforms[platform].answers;
  if (answers["requires_login"] !== "YES" && !app.review.username) {
    return "No login required — the app opens straight into browsable content.";
  }
  const r = app.review;
  return [
    "Demo email / username: " + (r.username || "(required — reviewers cannot proceed without this)"),
    "Demo password: " + (r.password || "(required)"),
    "",
    "Steps:",
    "1. Open the app and tap Login.",
    "2. Enter the credentials above.",
    r.loginInstructions
      ? `3. ${r.loginInstructions}`
      : "3. The dashboard loads with a pre-enrolled sample course; tap it to see lessons, live classes and tests.",
  ].join("\n");
}

/** Which review fields are missing given what the app has declared. Drives the "needs attention" list. */
export function missingReviewFields(app: AppRecord, platform: Platform): Array<keyof ReviewInfo> {
  const answers = app.platforms[platform].answers;
  const missing: Array<keyof ReviewInfo> = [];
  if (answers["requires_login"] === "YES") {
    if (!app.review.username.trim()) missing.push("username");
    if (!app.review.password.trim()) missing.push("password");
    if (!app.review.loginInstructions.trim()) missing.push("loginInstructions");
  }
  if (answers["paid_digital_content"] === "YES" && !app.review.subscriptionInstructions.trim()) {
    missing.push("subscriptionInstructions");
  }
  if (!app.review.contactInformation.trim() && !app.basics.supportEmail.trim()) {
    missing.push("contactInformation");
  }
  return missing;
}

/** Questions the platform still needs answered — used by the "what's next" nudges. */
export function unansweredQuestionIds(app: AppRecord, platform: Platform): string[] {
  const answers = app.platforms[platform].answers;
  return PLATFORM_QUESTIONS[platform]
    .filter((q) => {
      const value = answers[q.id];
      return value == null || (typeof value === "string" && value.trim() === "");
    })
    .map((q) => q.id);
}
