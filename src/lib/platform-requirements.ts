/**
 * The configurable platform-requirements catalogue.
 *
 * Every store rule the module enforces — asset pixel sizes, listing fields, Yes/No questions,
 * registration checklists — is *data* in this one file. Nothing in the UI hard-codes "Google wants
 * 1024x500"; components read these tables. When Apple changes a screenshot size or Google adds a
 * declaration, you edit a row here and the wizard, cropper, validator, checklist and progress bar
 * all move together.
 *
 * Everything here is plain JSON-shaped data on purpose: the day this graduates to a
 * `platform_requirements` table, the rows lift out unchanged. Check rules are declarative
 * descriptors (see `CheckRule`), never functions, for the same reason.
 */

import type { AppBasics, Platform, PrivacyProfile, ReviewInfo, StoreContent } from "@/types/app-registry";

/* ============================================================== asset specs */

export type AssetGroup = "screenshot" | "icon" | "graphic";

export interface AssetSpec {
  id: string;
  platform: Platform;
  label: string;
  group: AssetGroup;
  /** Target width/height in px. */
  width: number;
  height: number;
  /** EXACT — the store rejects anything else. MIN — larger is fine, smaller is not. */
  mode: "EXACT" | "MIN";
  formats: Array<"png" | "jpeg">;
  maxBytes: number;
  /** Alpha channel: some stores demand it (Play icon), some reject it (Apple icon). */
  transparency: "REQUIRED" | "FORBIDDEN" | "ANY";
  required: boolean;
  minCount: number;
  maxCount: number;
  helpText: string;
}

const MB = 1024 * 1024;

export const ASSET_SPECS: AssetSpec[] = [
  /* ---------------------------------------------------------------- Android */
  {
    id: "android_phone_screenshot",
    platform: "ANDROID",
    label: "Phone Screenshot",
    group: "screenshot",
    width: 1080,
    height: 1920,
    mode: "MIN",
    formats: ["png", "jpeg"],
    maxBytes: 8 * MB,
    transparency: "ANY",
    required: true,
    minCount: 2,
    maxCount: 8,
    helpText:
      "Play needs at least 2 phone screenshots. Each side must be 320–3840 px with a 9:16 or 16:9 ratio; 1080×1920 is the safe target.",
  },
  {
    id: "android_tablet_7_screenshot",
    platform: "ANDROID",
    label: "7-inch Tablet Screenshot",
    group: "screenshot",
    width: 1200,
    height: 1920,
    mode: "MIN",
    formats: ["png", "jpeg"],
    maxBytes: 8 * MB,
    transparency: "ANY",
    required: false,
    minCount: 0,
    maxCount: 8,
    helpText: "Optional, but without tablet screenshots Play flags the listing as 'not designed for tablets'.",
  },
  {
    id: "android_tablet_10_screenshot",
    platform: "ANDROID",
    label: "10-inch Tablet Screenshot",
    group: "screenshot",
    width: 1600,
    height: 2560,
    mode: "MIN",
    formats: ["png", "jpeg"],
    maxBytes: 8 * MB,
    transparency: "ANY",
    required: false,
    minCount: 0,
    maxCount: 8,
    helpText: "Needed if the app is offered to large-screen / Chromebook devices.",
  },
  {
    id: "android_feature_graphic",
    platform: "ANDROID",
    label: "Feature Graphic",
    group: "graphic",
    width: 1024,
    height: 500,
    mode: "EXACT",
    formats: ["png", "jpeg"],
    maxBytes: 15 * MB,
    transparency: "FORBIDDEN",
    required: true,
    minCount: 1,
    maxCount: 1,
    helpText: "The banner at the top of the Play listing. Exactly 1024×500, no alpha channel. Keep text away from the edges.",
  },
  {
    id: "android_app_icon",
    platform: "ANDROID",
    label: "App Icon",
    group: "icon",
    width: 512,
    height: 512,
    mode: "EXACT",
    formats: ["png"],
    maxBytes: 1 * MB,
    transparency: "ANY",
    required: true,
    minCount: 1,
    maxCount: 1,
    helpText: "32-bit PNG, exactly 512×512, under 1 MB. Play applies its own rounded mask — don't pre-round it.",
  },

  /* -------------------------------------------------------------------- iOS */
  {
    id: "ios_iphone_67_screenshot",
    platform: "IOS",
    label: 'iPhone 6.7" Screenshot',
    group: "screenshot",
    width: 1290,
    height: 2796,
    mode: "EXACT",
    formats: ["png", "jpeg"],
    maxBytes: 10 * MB,
    transparency: "FORBIDDEN",
    required: true,
    minCount: 1,
    maxCount: 10,
    helpText:
      "The one screenshot set Apple always requires. 1290×2796 (iPhone 15/16 Pro Max). Apple scales these down for smaller devices.",
  },
  {
    id: "ios_iphone_65_screenshot",
    platform: "IOS",
    label: 'iPhone 6.5" Screenshot',
    group: "screenshot",
    width: 1242,
    height: 2688,
    mode: "EXACT",
    formats: ["png", "jpeg"],
    maxBytes: 10 * MB,
    transparency: "FORBIDDEN",
    required: false,
    minCount: 0,
    maxCount: 10,
    helpText: "Legacy set. Only needed if you still target older device families explicitly.",
  },
  {
    id: "ios_ipad_129_screenshot",
    platform: "IOS",
    label: 'iPad 12.9" Screenshot',
    group: "screenshot",
    width: 2048,
    height: 2732,
    mode: "EXACT",
    formats: ["png", "jpeg"],
    maxBytes: 10 * MB,
    transparency: "FORBIDDEN",
    required: false,
    minCount: 0,
    maxCount: 10,
    helpText: "Mandatory the moment the binary declares iPad support. Submission is blocked without it.",
  },
  {
    id: "ios_app_icon",
    platform: "IOS",
    label: "App Store Icon",
    group: "icon",
    width: 1024,
    height: 1024,
    mode: "EXACT",
    formats: ["png"],
    maxBytes: 5 * MB,
    transparency: "FORBIDDEN",
    required: true,
    minCount: 1,
    maxCount: 1,
    helpText: "1024×1024 PNG, flattened — no alpha, no transparency, no rounded corners. Apple rejects alpha outright.",
  },

  /* ---------------------------------------------------------------- Windows */
  {
    id: "windows_desktop_screenshot",
    platform: "WINDOWS",
    label: "Desktop Screenshot",
    group: "screenshot",
    width: 1366,
    height: 768,
    mode: "MIN",
    formats: ["png"],
    maxBytes: 50 * MB,
    transparency: "ANY",
    required: true,
    minCount: 1,
    maxCount: 9,
    helpText: "At least one. 1366×768 minimum; 3840×2160 looks far better on the Store's hero area.",
  },
  {
    id: "windows_tablet_screenshot",
    platform: "WINDOWS",
    label: "Tablet Screenshot",
    group: "screenshot",
    width: 1920,
    height: 1080,
    mode: "MIN",
    formats: ["png"],
    maxBytes: 50 * MB,
    transparency: "ANY",
    required: false,
    minCount: 0,
    maxCount: 9,
    helpText: "Optional. Only useful if the app is listed for touch devices.",
  },
  {
    id: "windows_store_logo",
    platform: "WINDOWS",
    label: "Store Logo",
    group: "icon",
    width: 300,
    height: 300,
    mode: "EXACT",
    formats: ["png"],
    maxBytes: 2 * MB,
    transparency: "ANY",
    required: true,
    minCount: 1,
    maxCount: 1,
    helpText: "300×300 PNG. Partner Center calls this the Store logo; it's separate from the in-package tile assets.",
  },
  {
    id: "windows_promotional_tile",
    platform: "WINDOWS",
    label: "Promotional Tile (620×300)",
    group: "graphic",
    width: 620,
    height: 300,
    mode: "EXACT",
    formats: ["png"],
    maxBytes: 2 * MB,
    transparency: "ANY",
    required: false,
    minCount: 0,
    maxCount: 1,
    helpText: "Optional, but required to be eligible for Store merchandising and spotlight placements.",
  },

  /* ------------------------------------------------------------------ macOS */
  {
    id: "macos_screenshot",
    platform: "MACOS",
    label: "Mac Screenshot",
    group: "screenshot",
    width: 2880,
    height: 1800,
    mode: "EXACT",
    formats: ["png", "jpeg"],
    maxBytes: 10 * MB,
    transparency: "FORBIDDEN",
    required: true,
    minCount: 1,
    maxCount: 10,
    helpText:
      "Apple accepts exactly 1280×800, 1440×900, 2560×1600 or 2880×1800. Anything else is refused — 2880×1800 is the sharpest.",
  },
  {
    id: "macos_screenshot_1440",
    platform: "MACOS",
    label: "Mac Screenshot (1440×900)",
    group: "screenshot",
    width: 1440,
    height: 900,
    mode: "EXACT",
    formats: ["png", "jpeg"],
    maxBytes: 10 * MB,
    transparency: "FORBIDDEN",
    required: false,
    minCount: 0,
    maxCount: 10,
    helpText: "Alternative accepted Mac size. Use whichever matches your capture resolution.",
  },
  {
    id: "macos_app_icon",
    platform: "MACOS",
    label: "App Store Icon",
    group: "icon",
    width: 1024,
    height: 1024,
    mode: "EXACT",
    formats: ["png"],
    maxBytes: 5 * MB,
    transparency: "FORBIDDEN",
    required: true,
    minCount: 1,
    maxCount: 1,
    helpText: "Same rules as iOS: 1024×1024, flattened, no alpha.",
  },
];

export function assetSpecsFor(platform: Platform): AssetSpec[] {
  return ASSET_SPECS.filter((s) => s.platform === platform);
}

export function assetSpecById(id: string): AssetSpec | undefined {
  return ASSET_SPECS.find((s) => s.id === id);
}

/* ==================================================================== fields */

export interface FieldSpec {
  id: string;
  label: string;
  type: "text" | "textarea" | "url" | "email" | "tel" | "select" | "number";
  required: boolean;
  options?: string[];
  placeholder?: string;
  helpText?: string;
  maxLength?: number;
  /** Two-column layout hint: `full` spans the row. */
  span?: "half" | "full";
}

export const APP_CATEGORIES = [
  "Education",
  "Business",
  "Productivity",
  "Utilities",
  "Reference",
  "Lifestyle",
  "Medical",
  "Finance",
  "Entertainment",
] as const;

export const LANGUAGES = ["en-IN", "en-US", "en-GB", "hi-IN", "mr-IN", "gu-IN", "ta-IN", "te-IN"] as const;

/** Step 1 of the wizard. Keyed to `AppBasics`. */
export const BASIC_FIELDS: Array<FieldSpec & { key: keyof AppBasics }> = [
  { id: "name", key: "name", label: "App Name", type: "text", required: true, maxLength: 30, placeholder: "STEMx Education", helpText: "30 characters max — both stores truncate beyond that." },
  { id: "displayName", key: "displayName", label: "App Display Name", type: "text", required: true, placeholder: "STEMx", helpText: "The name under the icon on the home screen." },
  { id: "packageName", key: "packageName", label: "Package Name / Bundle ID", type: "text", required: true, placeholder: "io.vacademy.stemx", helpText: "Permanent. Cannot be changed after the first store submission." },
  { id: "client", key: "client", label: "Client / Institute", type: "text", required: true, placeholder: "STEMx Education" },
  { id: "websiteUrl", key: "websiteUrl", label: "Website URL", type: "url", required: false, placeholder: "https://stemx.vacademy.io", helpText: "Used by the store-content generator to draft descriptions." },
  { id: "supportEmail", key: "supportEmail", label: "Support Email", type: "email", required: true, placeholder: "support@stemx.io", helpText: "Shown publicly on the listing. Must be a monitored inbox." },
  { id: "supportPhone", key: "supportPhone", label: "Support Phone", type: "tel", required: false, placeholder: "+91 98765 43210" },
  { id: "developerName", key: "developerName", label: "Developer / Organization Name", type: "text", required: true, helpText: "Must match the legal entity on the developer account." },
  { id: "category", key: "category", label: "App Category", type: "select", required: true, options: [...APP_CATEGORIES] },
  { id: "appType", key: "appType", label: "App Type", type: "select", required: true, options: ["WHITE_LABEL", "INTERNAL", "PUBLIC"] },
  { id: "primaryLanguage", key: "primaryLanguage", label: "Primary Language", type: "select", required: true, options: [...LANGUAGES] },
  { id: "shortDescription", key: "shortDescription", label: "Short Description", type: "textarea", required: true, maxLength: 80, span: "full", helpText: "80 characters. This is the line under the title on Play." },
  { id: "description", key: "description", label: "App Description", type: "textarea", required: true, maxLength: 4000, span: "full", helpText: "Up to 4000 characters. The generator can draft this from the website." },
  { id: "privacyPolicyUrl", key: "privacyPolicyUrl", label: "Privacy Policy URL", type: "url", required: true, helpText: "Mandatory on every store. Must be reachable without login." },
  { id: "termsUrl", key: "termsUrl", label: "Terms & Conditions URL", type: "url", required: false },
  { id: "supportUrl", key: "supportUrl", label: "Support URL", type: "url", required: true, helpText: "Apple rejects submissions where this 404s." },
];

export const PLATFORM_FIELDS: Record<Platform, FieldSpec[]> = {
  ANDROID: [
    { id: "package_name", label: "Package Name", type: "text", required: true, placeholder: "io.vacademy.stemx" },
    { id: "application_id", label: "Application ID", type: "text", required: true, helpText: "The Gradle applicationId. Usually identical to the package name." },
    { id: "play_account", label: "Google Play Developer Account", type: "text", required: true, placeholder: "Vidyayatan Technologies (dev-id)" },
    { id: "store_app_name", label: "Store App Name", type: "text", required: true, maxLength: 30 },
    { id: "play_category", label: "Category", type: "select", required: true, options: ["Education", "Business", "Productivity", "Books & Reference", "Medical", "Finance"] },
    { id: "content_rating", label: "Content Rating", type: "select", required: true, options: ["Everyone", "Everyone 10+", "Teen", "Mature 17+"], helpText: "Assigned by the IARC questionnaire inside Play Console — record the outcome here." },
    { id: "target_audience", label: "Target Audience", type: "select", required: true, options: ["Ages 18+", "Ages 13-17", "Ages 6-12", "Under 5", "Mixed ages"], helpText: "Anything including under-13 pulls the app into Play's Families policy." },
    { id: "app_access_notes", label: "App Access (reviewer credentials)", type: "textarea", required: true, span: "full", helpText: "If any part of the app is behind a login, Play needs working demo credentials here or it rejects the release." },
    { id: "signing_sha1", label: "Signing SHA-1", type: "text", required: false, helpText: "Handy for Firebase/Maps key setup and for verifying which keystore produced a build." },
    { id: "privacy_policy_url", label: "Privacy Policy URL", type: "url", required: true },
  ],
  IOS: [
    { id: "app_name", label: "App Name", type: "text", required: true, maxLength: 30 },
    { id: "bundle_id", label: "Bundle ID", type: "text", required: true, placeholder: "io.vacademy.stemx" },
    { id: "sku", label: "SKU", type: "text", required: true, helpText: "Your own internal identifier. Never shown to users, never reusable." },
    { id: "apple_account", label: "Apple Developer Account", type: "text", required: true },
    { id: "team_id", label: "Team ID", type: "text", required: true, placeholder: "A1B2C3D4E5" },
    { id: "asc_app_id", label: "App Store Connect App ID", type: "text", required: false, helpText: "The numeric id created when the app record is made. Needed for API status checks." },
    { id: "primary_category", label: "Primary Category", type: "select", required: true, options: ["Education", "Business", "Productivity", "Reference", "Utilities", "Medical", "Finance"] },
    { id: "secondary_category", label: "Secondary Category", type: "select", required: false, options: ["None", "Education", "Business", "Productivity", "Reference", "Utilities"] },
    { id: "subtitle", label: "Subtitle", type: "text", required: false, maxLength: 30, helpText: "30 characters, shown under the name in search results." },
    { id: "keywords", label: "Keywords", type: "text", required: true, maxLength: 100, span: "full", helpText: "100 characters total, comma-separated, no spaces after commas — spaces waste the budget." },
    { id: "promotional_text", label: "Promotional Text", type: "textarea", required: false, maxLength: 170, span: "full", helpText: "170 characters. The only copy you can change without shipping a new build." },
    { id: "description", label: "Description", type: "textarea", required: true, maxLength: 4000, span: "full" },
    { id: "support_url", label: "Support URL", type: "url", required: true },
    { id: "marketing_url", label: "Marketing URL", type: "url", required: false },
    { id: "privacy_policy_url", label: "Privacy Policy URL", type: "url", required: true },
    { id: "copyright", label: "Copyright", type: "text", required: true, placeholder: "2026 Vidyayatan Technologies Pvt Ltd" },
    { id: "age_rating", label: "Age Rating", type: "select", required: true, options: ["4+", "9+", "12+", "17+"] },
  ],
  WINDOWS: [
    { id: "app_name", label: "App Name", type: "text", required: true, helpText: "Must be reserved in Partner Center before anything else can be filled in." },
    { id: "package_identity", label: "Package Identity", type: "text", required: true, placeholder: "12345Vidyayatan.STEMx" },
    { id: "publisher_id", label: "Publisher ID", type: "text", required: true, placeholder: "CN=ABCD1234-..." },
    { id: "partner_center_account", label: "Microsoft Partner Center Account", type: "text", required: true },
    { id: "store_id", label: "Store ID", type: "text", required: false, placeholder: "9NBLGGH4XXXX" },
    { id: "short_description", label: "Short Description", type: "textarea", required: true, maxLength: 1000, span: "full" },
    { id: "description", label: "Description", type: "textarea", required: true, maxLength: 10000, span: "full" },
    { id: "privacy_url", label: "Privacy URL", type: "url", required: true },
    { id: "support_url", label: "Support URL", type: "url", required: true },
    { id: "category", label: "Category", type: "select", required: true, options: ["Education", "Business", "Productivity", "Utilities & tools", "Books & reference"] },
    { id: "version", label: "Version", type: "text", required: true, placeholder: "2.4.1.0", helpText: "Windows uses a four-part version. The fourth part must be 0 for Store submissions." },
    { id: "architecture", label: "Architecture", type: "select", required: true, options: ["x64", "x86", "ARM64", "x64 + ARM64"] },
  ],
  MACOS: [
    { id: "app_name", label: "App Name", type: "text", required: true, maxLength: 30 },
    { id: "bundle_id", label: "Bundle ID", type: "text", required: true, placeholder: "io.vacademy.stemx.mac", helpText: "Distinct from the iOS bundle ID unless you ship a true universal app." },
    { id: "sku", label: "SKU", type: "text", required: true },
    { id: "apple_account", label: "Apple Developer Account", type: "text", required: true },
    { id: "asc_app_id", label: "App Store Connect App ID", type: "text", required: false },
    { id: "category", label: "Category", type: "select", required: true, options: ["Education", "Business", "Productivity", "Reference", "Utilities"] },
    { id: "subtitle", label: "Subtitle", type: "text", required: false, maxLength: 30 },
    { id: "keywords", label: "Keywords", type: "text", required: true, maxLength: 100, span: "full" },
    { id: "description", label: "Description", type: "textarea", required: true, maxLength: 4000, span: "full" },
    { id: "min_macos", label: "Minimum macOS Version", type: "text", required: true, placeholder: "12.0", helpText: "An arm64 build needs 12.0 or later; anything lower fails validation." },
    { id: "privacy_policy_url", label: "Privacy Policy URL", type: "url", required: true },
    { id: "support_url", label: "Support URL", type: "url", required: true },
    { id: "marketing_url", label: "Marketing URL", type: "url", required: false },
  ],
};

/* ============================================================= questionnaire */

export interface QuestionSpec {
  id: string;
  question: string;
  /** Plain-English reason this answer matters — shown under every question. */
  why: string;
  type: "YES_NO" | "MULTI";
  options?: string[];
  /** Questions that only appear once this one is answered a particular way. */
  followUps?: Array<{ whenAnswer: string; questions: QuestionSpec[] }>;
  /** Extra field the answer unlocks (e.g. account-deletion URL). */
  unlocksField?: FieldSpec;
  /** Shown as a callout when the trigger answer is given. */
  noteOnAnswer?: { whenAnswer: string; text: string };
}

const DATA_CATEGORIES = [
  "Name",
  "Email address",
  "Phone number",
  "Location",
  "Payment information",
  "User-generated content",
  "Device identifiers",
  "Photos or videos",
  "Contacts",
  "Usage / analytics data",
];

/** Asked once and reused by every platform — the stores ask the same things in different words. */
const COMMON_QUESTIONS: QuestionSpec[] = [
  {
    id: "collects_personal_data",
    question: "Does the app collect personal information?",
    why: "Drives Play's Data Safety form and Apple's App Privacy 'nutrition label'. Getting this wrong is the single most common cause of a rejected first submission.",
    type: "YES_NO",
    followUps: [
      {
        whenAnswer: "YES",
        questions: [
          {
            id: "data_categories",
            question: "Which categories of data does the app collect?",
            why: "Every box ticked here must be declared, item for item, on both stores' privacy forms.",
            type: "MULTI",
            options: DATA_CATEGORIES,
          },
          {
            id: "data_encrypted_in_transit",
            question: "Is all collected data encrypted in transit?",
            why: "Both stores ask this outright. Answering No forces a written justification.",
            type: "YES_NO",
          },
        ],
      },
    ],
  },
  {
    id: "account_creation",
    question: "Does the app allow account creation?",
    why: "The moment this is Yes, Apple and Google both require an in-app account-deletion route and a public deletion URL.",
    type: "YES_NO",
    noteOnAnswer: {
      whenAnswer: "YES",
      text: "Account deletion is now mandatory. Both stores require an in-app path to delete the account plus a publicly reachable deletion URL.",
    },
    followUps: [
      {
        whenAnswer: "YES",
        questions: [
          {
            id: "account_deletion_supported",
            question: "Can users delete their account from inside the app?",
            why: "Apple Guideline 5.1.1(v) and Play's Data deletion policy. A No here blocks the release outright.",
            type: "YES_NO",
            unlocksField: {
              id: "account_deletion_url",
              label: "Account Deletion URL",
              type: "url",
              required: true,
              helpText: "Must be reachable without logging in — reviewers open it in a fresh browser.",
            },
          },
        ],
      },
    ],
  },
  {
    id: "requires_login",
    question: "Is any part of the app behind a login?",
    why: "If yes, a working demo account must be supplied or reviewers cannot see the app and reject it as broken.",
    type: "YES_NO",
    noteOnAnswer: {
      whenAnswer: "YES",
      text: "Fill in the Review Information tab with demo credentials. This is the #1 reason white-label education apps get rejected.",
    },
  },
  {
    id: "user_generated_content",
    question: "Does the app contain user-generated content?",
    why: "Triggers Apple Guideline 1.2: you must provide content filtering, a report mechanism, blocking, and a published contact method.",
    type: "YES_NO",
    noteOnAnswer: {
      whenAnswer: "YES",
      text: "You need all four UGC safeguards: filtering, reporting, user blocking, and a published contact. Missing any one is an automatic rejection.",
    },
  },
  {
    id: "paid_digital_content",
    question: "Does the app contain paid digital content?",
    why: "Digital goods consumed inside the app must use the store's own billing. Routing to an external gateway breaks Apple 3.1.1 and Play's Payments policy.",
    type: "YES_NO",
    followUps: [
      {
        whenAnswer: "YES",
        questions: [
          {
            id: "uses_store_billing",
            question: "Does it use the store's in-app purchase / billing system?",
            why: "No means you must qualify for a 'reader' or physical-goods exemption, and say so in the review notes.",
            type: "YES_NO",
          },
        ],
      },
    ],
  },
  {
    id: "third_party_login",
    question: "Does the app use third-party login (Google / Facebook / Apple)?",
    why: "Apple 4.8: if you offer any third-party social login, you must also offer Sign in with Apple or an equivalent private option.",
    type: "YES_NO",
  },
  {
    id: "contains_ads",
    question: "Does the app contain ads?",
    why: "Declared on Play's App content page and drives the ad-ID permission declaration. An undeclared ad SDK is treated as a policy violation.",
    type: "YES_NO",
  },
  {
    id: "targets_children",
    question: "Is the app directed at children under 13?",
    why: "Pulls the app into Play's Families policy and Apple's Kids Category, both of which forbid third-party analytics and behavioural ads.",
    type: "YES_NO",
  },
];

const ANDROID_ONLY: QuestionSpec[] = [
  {
    id: "government_app",
    question: "Is this app associated with a government entity?",
    why: "Play requires proof of authorisation from the government body. Without it the listing is taken down.",
    type: "YES_NO",
  },
  {
    id: "financial_features",
    question: "Does the app provide financial features (loans, payments, crypto, investment)?",
    why: "Play's Financial Services policy requires licence documentation per country before the app can go live.",
    type: "YES_NO",
  },
  {
    id: "health_features",
    question: "Does the app provide health features?",
    why: "Play's Health apps declaration. Applies to anything giving medical, mental-health or fitness guidance.",
    type: "YES_NO",
  },
];

const IOS_ONLY: QuestionSpec[] = [
  {
    id: "uses_idfa",
    question: "Does the app track users across other companies' apps or websites?",
    why: "If yes, the binary must show the App Tracking Transparency prompt. Apple tests this and rejects apps that track without it.",
    type: "YES_NO",
  },
  {
    id: "uses_encryption",
    question: "Does the app use encryption beyond standard HTTPS?",
    why: "Export-compliance question asked on every single build upload. Standard HTTPS alone qualifies for the exemption.",
    type: "YES_NO",
  },
];

export const PLATFORM_QUESTIONS: Record<Platform, QuestionSpec[]> = {
  ANDROID: [...COMMON_QUESTIONS, ...ANDROID_ONLY],
  IOS: [...COMMON_QUESTIONS, ...IOS_ONLY],
  WINDOWS: COMMON_QUESTIONS,
  MACOS: [...COMMON_QUESTIONS, ...IOS_ONLY],
};

/* ================================================================ checklists */

/**
 * Declarative completion rules. Kept as data (not predicates) so the whole catalogue stays
 * serialisable — `@/lib/app-checklist` is the one place that knows how to evaluate them.
 */
export type CheckRule =
  | { kind: "basic"; key: keyof AppBasics }
  | { kind: "field"; fieldId: string }
  | { kind: "answer"; questionId: string }
  | { kind: "asset"; specId: string }
  | { kind: "privacy"; key: keyof PrivacyProfile }
  | { kind: "review"; key: keyof ReviewInfo }
  | { kind: "content"; key: keyof StoreContent }
  | { kind: "version" }
  | { kind: "submitted" }
  | { kind: "all"; rules: CheckRule[] }
  | { kind: "manual" };

export type ChecklistSection =
  | "Basic Information"
  | "Platform Setup"
  | "Store Listing"
  | "App Content"
  | "Privacy & Security"
  | "Assets"
  | "Build"
  | "Submission";

/** Order the progress bar walks in — mirrors the real-world order of work. */
export const CHECKLIST_SECTIONS: ChecklistSection[] = [
  "Basic Information",
  "Platform Setup",
  "Store Listing",
  "App Content",
  "Privacy & Security",
  "Assets",
  "Build",
  "Submission",
];

export interface ChecklistItem {
  id: string;
  section: ChecklistSection;
  label: string;
  required: boolean;
  help: string;
  rule: CheckRule;
}

/** Rows shared by all four stores; per-platform tables append to these. */
function commonRows(): ChecklistItem[] {
  return [
    { id: "c_name", section: "Basic Information", label: "App Name", required: true, help: "30 characters or fewer.", rule: { kind: "basic", key: "name" } },
    { id: "c_package", section: "Basic Information", label: "Package Name / Bundle ID", required: true, help: "Permanent once submitted.", rule: { kind: "basic", key: "packageName" } },
    { id: "c_support_email", section: "Basic Information", label: "Support Email", required: true, help: "Publicly listed, must be monitored.", rule: { kind: "basic", key: "supportEmail" } },
    { id: "c_short_desc", section: "Store Listing", label: "Short Description", required: true, help: "The one-liner under the title.", rule: { kind: "content", key: "shortDescription" } },
    { id: "c_full_desc", section: "Store Listing", label: "Full Description", required: true, help: "Generate it from the website, then edit.", rule: { kind: "content", key: "fullDescription" } },
    { id: "c_privacy_url", section: "Privacy & Security", label: "Privacy Policy URL", required: true, help: "Must load without a login.", rule: { kind: "privacy", key: "privacyPolicyUrl" } },
    { id: "c_data_collection", section: "Privacy & Security", label: "Data collection declared", required: true, help: "Answer the personal-data question.", rule: { kind: "answer", questionId: "collects_personal_data" } },
    { id: "c_account_creation", section: "App Content", label: "Account creation declared", required: true, help: "Drives the account-deletion requirement.", rule: { kind: "answer", questionId: "account_creation" } },
    { id: "c_ugc", section: "App Content", label: "User-generated content declared", required: true, help: "Triggers the UGC safeguards.", rule: { kind: "answer", questionId: "user_generated_content" } },
    { id: "c_review_notes", section: "Submission", label: "Review Notes", required: true, help: "What the reviewer reads first.", rule: { kind: "content", key: "reviewNotes" } },
    { id: "c_version", section: "Build", label: "Production Build", required: true, help: "At least one version recorded.", rule: { kind: "version" } },
    { id: "c_submitted", section: "Submission", label: "Submitted to store", required: true, help: "Logged in submission history.", rule: { kind: "submitted" } },
  ];
}

export const PLATFORM_CHECKLISTS: Record<Platform, ChecklistItem[]> = {
  ANDROID: [
    ...commonRows(),
    { id: "a_account", section: "Platform Setup", label: "Play Developer Account", required: true, help: "Which account owns the listing.", rule: { kind: "field", fieldId: "play_account" } },
    { id: "a_appid", section: "Platform Setup", label: "Application ID", required: true, help: "Gradle applicationId.", rule: { kind: "field", fieldId: "application_id" } },
    { id: "a_icon", section: "Assets", label: "App Icon (512×512)", required: true, help: "32-bit PNG under 1 MB.", rule: { kind: "asset", specId: "android_app_icon" } },
    { id: "a_feature", section: "Assets", label: "Feature Graphic (1024×500)", required: true, help: "Exact size, no alpha.", rule: { kind: "asset", specId: "android_feature_graphic" } },
    { id: "a_shots", section: "Assets", label: "Phone Screenshots (min 2)", required: true, help: "Play blocks release below 2.", rule: { kind: "asset", specId: "android_phone_screenshot" } },
    { id: "a_data_safety", section: "App Content", label: "Data Safety form", required: true, help: "Completed in Play Console.", rule: { kind: "manual" } },
    { id: "a_content_rating", section: "App Content", label: "Content Rating (IARC)", required: true, help: "Questionnaire completed.", rule: { kind: "field", fieldId: "content_rating" } },
    { id: "a_target_audience", section: "App Content", label: "Target Audience", required: true, help: "Under-13 triggers Families policy.", rule: { kind: "field", fieldId: "target_audience" } },
    { id: "a_ads", section: "App Content", label: "Ads declaration", required: true, help: "Undeclared ad SDKs are a violation.", rule: { kind: "answer", questionId: "contains_ads" } },
    { id: "a_app_access", section: "App Content", label: "App Access (demo credentials)", required: true, help: "Required whenever anything is behind a login.", rule: { kind: "field", fieldId: "app_access_notes" } },
    { id: "a_gov", section: "App Content", label: "Government app declaration", required: true, help: "Needs authorisation proof if yes.", rule: { kind: "answer", questionId: "government_app" } },
    { id: "a_financial", section: "App Content", label: "Financial features declaration", required: true, help: "Licence docs required if yes.", rule: { kind: "answer", questionId: "financial_features" } },
    { id: "a_health", section: "App Content", label: "Health features declaration", required: true, help: "Health apps declaration form.", rule: { kind: "answer", questionId: "health_features" } },
  ],
  IOS: [
    ...commonRows(),
    { id: "i_account", section: "Platform Setup", label: "Apple Developer Account", required: true, help: "Team that owns the app record.", rule: { kind: "field", fieldId: "apple_account" } },
    { id: "i_team", section: "Platform Setup", label: "Team ID", required: true, help: "Ten-character team identifier.", rule: { kind: "field", fieldId: "team_id" } },
    { id: "i_sku", section: "Platform Setup", label: "SKU", required: true, help: "Internal id, never reusable.", rule: { kind: "field", fieldId: "sku" } },
    { id: "i_subtitle", section: "Store Listing", label: "Subtitle", required: false, help: "30 characters under the name.", rule: { kind: "field", fieldId: "subtitle" } },
    { id: "i_keywords", section: "Store Listing", label: "Keywords", required: true, help: "100 characters, comma-separated.", rule: { kind: "field", fieldId: "keywords" } },
    { id: "i_copyright", section: "Store Listing", label: "Copyright", required: true, help: "Legal entity plus year.", rule: { kind: "field", fieldId: "copyright" } },
    { id: "i_age", section: "App Content", label: "Age Rating", required: true, help: "From Apple's rating questionnaire.", rule: { kind: "field", fieldId: "age_rating" } },
    { id: "i_icon", section: "Assets", label: "App Icon (1024×1024)", required: true, help: "No alpha channel.", rule: { kind: "asset", specId: "ios_app_icon" } },
    { id: "i_shots", section: "Assets", label: 'iPhone 6.7" Screenshots', required: true, help: "The one required set.", rule: { kind: "asset", specId: "ios_iphone_67_screenshot" } },
    { id: "i_atn", section: "App Content", label: "Tracking (ATT) declaration", required: true, help: "Drives the ATT prompt requirement.", rule: { kind: "answer", questionId: "uses_idfa" } },
    { id: "i_export", section: "App Content", label: "Export compliance", required: true, help: "Asked on every build upload.", rule: { kind: "answer", questionId: "uses_encryption" } },
    { id: "i_demo", section: "Submission", label: "Demo account for reviewer", required: true, help: "Mandatory when login is required.", rule: { kind: "review", key: "username" } },
  ],
  WINDOWS: [
    ...commonRows(),
    { id: "w_reserve", section: "Platform Setup", label: "App name reserved in Partner Center", required: true, help: "Nothing else can start until this is done.", rule: { kind: "field", fieldId: "app_name" } },
    { id: "w_identity", section: "Platform Setup", label: "Package Identity", required: true, help: "Must match the manifest exactly.", rule: { kind: "field", fieldId: "package_identity" } },
    { id: "w_publisher", section: "Platform Setup", label: "Publisher ID", required: true, help: "From Partner Center; signs the package.", rule: { kind: "field", fieldId: "publisher_id" } },
    { id: "w_arch", section: "Build", label: "Architecture selected", required: true, help: "x64 covers most; add ARM64 for Copilot+ PCs.", rule: { kind: "field", fieldId: "architecture" } },
    { id: "w_version", section: "Build", label: "Four-part version", required: true, help: "Fourth part must be 0.", rule: { kind: "field", fieldId: "version" } },
    { id: "w_logo", section: "Assets", label: "Store Logo (300×300)", required: true, help: "Separate from in-package tiles.", rule: { kind: "asset", specId: "windows_store_logo" } },
    { id: "w_shots", section: "Assets", label: "Desktop Screenshots", required: true, help: "At least one, 1366×768 or larger.", rule: { kind: "asset", specId: "windows_desktop_screenshot" } },
  ],
  MACOS: [
    ...commonRows(),
    { id: "m_account", section: "Platform Setup", label: "Apple Developer Account", required: true, help: "Same team as iOS unless deliberately split.", rule: { kind: "field", fieldId: "apple_account" } },
    { id: "m_bundle", section: "Platform Setup", label: "Bundle ID", required: true, help: "Usually distinct from the iOS bundle.", rule: { kind: "field", fieldId: "bundle_id" } },
    { id: "m_minos", section: "Build", label: "Minimum macOS version", required: true, help: "arm64 builds need 12.0 or later.", rule: { kind: "field", fieldId: "min_macos" } },
    { id: "m_keywords", section: "Store Listing", label: "Keywords", required: true, help: "100 characters, comma-separated.", rule: { kind: "field", fieldId: "keywords" } },
    { id: "m_icon", section: "Assets", label: "App Icon (1024×1024)", required: true, help: "Flattened, no alpha.", rule: { kind: "asset", specId: "macos_app_icon" } },
    { id: "m_shots", section: "Assets", label: "Mac Screenshots", required: true, help: "Only four exact sizes are accepted.", rule: { kind: "asset", specId: "macos_screenshot" } },
    { id: "m_notarize", section: "Build", label: "Signed & notarised archive", required: true, help: "Mac App Store distribution certificate, then notarisation.", rule: { kind: "manual" } },
  ],
};

/* ==================================================== security checklist (§16) */

export const SECURITY_CHECKLIST: Array<{ id: string; label: string; help: string }> = [
  { id: "https", label: "HTTPS everywhere", help: "No cleartext traffic. Android blocks it by default from API 28 up." },
  { id: "secure_auth", label: "Secure authentication", help: "Tokens issued server-side, never a hard-coded credential in the binary." },
  { id: "token_expiry", label: "Token expiration & refresh", help: "Short-lived access tokens with a refresh path." },
  { id: "password_hashing", label: "Password hashing", help: "bcrypt/argon2 at rest — never reversible encryption." },
  { id: "encryption_at_rest", label: "Encryption at rest", help: "Database and file storage encrypted." },
  { id: "api_auth", label: "API authentication on every endpoint", help: "No unauthenticated data endpoints, including internal ones." },
  { id: "rbac", label: "Role-based access control", help: "A learner token cannot reach admin data." },
  { id: "no_secrets_in_logs", label: "No sensitive data in logs", help: "No tokens, passwords or full phone numbers in application logs." },
];

/* ============================================= store-provider capabilities (§19) */

/**
 * What each store's *official* API can actually do. Anything false renders as
 * "Manual action required" — the module never automates a store console UI to fake it.
 */
export interface ProviderCapabilities {
  getAppStatus: boolean;
  getLatestVersion: boolean;
  getBuildStatus: boolean;
  getReleaseStatus: boolean;
  getSubmissionStatus: boolean;
  getReviews: boolean;
  createListing: boolean;
  submitForReview: boolean;
}

export const PROVIDER_CAPABILITIES: Record<
  Platform,
  { provider: string; auth: string; docs: string; capabilities: ProviderCapabilities; notes: string }
> = {
  ANDROID: {
    provider: "GooglePlayProvider",
    auth: "Google Cloud service account (JSON key) with Play Developer API access",
    docs: "https://developers.google.com/android-publisher",
    capabilities: {
      getAppStatus: true,
      getLatestVersion: true,
      getBuildStatus: true,
      getReleaseStatus: true,
      getSubmissionStatus: true,
      getReviews: true,
      createListing: false,
      submitForReview: true,
    },
    notes:
      "The Play Developer API can read tracks/releases and roll out an already-uploaded AAB, but a brand-new app record must still be created by hand in Play Console.",
  },
  IOS: {
    provider: "AppStoreConnectProvider",
    auth: "App Store Connect API key (Issuer ID + Key ID + .p8 private key, JWT signed)",
    docs: "https://developer.apple.com/documentation/appstoreconnectapi",
    capabilities: {
      getAppStatus: true,
      getLatestVersion: true,
      getBuildStatus: true,
      getReleaseStatus: true,
      getSubmissionStatus: true,
      getReviews: true,
      createListing: true,
      submitForReview: true,
    },
    notes:
      "The most complete of the four APIs: app records, versions, builds, review submissions and customer reviews are all readable and writable.",
  },
  WINDOWS: {
    provider: "MicrosoftStoreProvider",
    auth: "Azure AD application (tenant + client ID + secret) linked to Partner Center",
    docs: "https://learn.microsoft.com/windows/uwp/monetize/create-and-manage-submissions-using-windows-store-services",
    capabilities: {
      getAppStatus: true,
      getLatestVersion: true,
      getBuildStatus: true,
      getReleaseStatus: true,
      getSubmissionStatus: true,
      getReviews: true,
      createListing: false,
      submitForReview: true,
    },
    notes:
      "Submission API covers updates to an existing app. Reserving the app name and the first submission stay manual in Partner Center.",
  },
  MACOS: {
    provider: "MacAppStoreProvider",
    auth: "App Store Connect API key (same credential as iOS)",
    docs: "https://developer.apple.com/documentation/appstoreconnectapi",
    capabilities: {
      getAppStatus: true,
      getLatestVersion: true,
      getBuildStatus: true,
      getReleaseStatus: true,
      getSubmissionStatus: true,
      getReviews: true,
      createListing: true,
      submitForReview: true,
    },
    notes: "Shares the iOS credential and endpoints; the platform filter on the app record selects MAC_OS.",
  },
};
