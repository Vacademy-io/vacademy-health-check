/**
 * Domain model for the App Registration & Store Management module.
 *
 * Everything an app *is* lives in one `AppRecord`. What the stores *demand* deliberately does not
 * live here — it sits in the configurable catalogue (`@/lib/platform-requirements`), so Google,
 * Apple and Microsoft can move their goalposts without anyone editing this file or the UI.
 */

export const PLATFORMS = ["ANDROID", "IOS", "WINDOWS", "MACOS"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  ANDROID: "Android",
  IOS: "iOS",
  WINDOWS: "Windows",
  MACOS: "macOS",
};

export const STORE_LABELS: Record<Platform, string> = {
  ANDROID: "Google Play Store",
  IOS: "Apple App Store",
  WINDOWS: "Microsoft Store",
  MACOS: "Mac App Store",
};

/* ------------------------------------------------------------------ status */

export const STORE_STATUSES = [
  "NOT_REGISTERED",
  "DRAFT",
  "READY_FOR_SUBMISSION",
  "SUBMITTED",
  "IN_REVIEW",
  "REJECTED",
  "APPROVED",
  "LIVE",
  "SUSPENDED",
  "REMOVED",
  "UPDATE_AVAILABLE",
  "BUILD_PROCESSING",
  "FAILED",
] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

/** Visual + semantic metadata for every status, so no component invents its own colours. */
export const STATUS_META: Record<
  StoreStatus,
  { label: string; tone: "neutral" | "info" | "warn" | "good" | "bad"; dot: string; help: string }
> = {
  NOT_REGISTERED: {
    label: "Not Registered",
    tone: "neutral",
    dot: "⚪",
    help: "No listing exists on this store yet.",
  },
  DRAFT: {
    label: "Draft",
    tone: "neutral",
    dot: "⚪",
    help: "Listing started in the store console but never submitted.",
  },
  READY_FOR_SUBMISSION: {
    label: "Ready for Submission",
    tone: "info",
    dot: "🔵",
    help: "Everything required is filled in — someone needs to press submit in the store console.",
  },
  SUBMITTED: { label: "Submitted", tone: "info", dot: "🔵", help: "Sent to the store, not picked up by a reviewer yet." },
  IN_REVIEW: { label: "In Review", tone: "warn", dot: "🟡", help: "A store reviewer is looking at the build right now." },
  REJECTED: { label: "Rejected", tone: "bad", dot: "🔴", help: "The store refused the build. Fix the cited guideline and resubmit." },
  APPROVED: { label: "Approved", tone: "good", dot: "🟢", help: "Review passed. Waiting on release (manual or phased)." },
  LIVE: { label: "Live", tone: "good", dot: "🟢", help: "Publicly downloadable on the store." },
  SUSPENDED: { label: "Suspended", tone: "bad", dot: "🔴", help: "The store pulled the app for a policy violation." },
  REMOVED: { label: "Removed", tone: "neutral", dot: "⚪", help: "Delisted — by us or by the store." },
  UPDATE_AVAILABLE: {
    label: "Update Available",
    tone: "info",
    dot: "🔵",
    help: "A newer build exists than the one the store is serving.",
  },
  BUILD_PROCESSING: {
    label: "Build Processing",
    tone: "warn",
    dot: "🟡",
    help: "The store is still processing the uploaded binary. Nothing to do but wait.",
  },
  FAILED: { label: "Failed", tone: "bad", dot: "🔴", help: "Upload or processing failed. Check the build logs." },
};

/* ------------------------------------------------------------------ basics */

export type AppType = "WHITE_LABEL" | "INTERNAL" | "PUBLIC";

export interface AppBasics {
  name: string;
  displayName: string;
  packageName: string;
  client: string;
  /**
   * Owning institute id, so the institute's own admin dashboard can show this app's status.
   * Optional — internal/ops tooling apps with no single owning institute leave this blank.
   */
  instituteId: string;
  websiteUrl: string;
  supportEmail: string;
  supportPhone: string;
  developerName: string;
  category: string;
  appType: AppType;
  description: string;
  shortDescription: string;
  primaryLanguage: string;
  privacyPolicyUrl: string;
  termsUrl: string;
  supportUrl: string;
}

/* ------------------------------------------------- per-platform configuration */

/** Manual override for a checklist row the catalogue cannot decide on its own. */
export type ChecklistOverride = "COMPLETED" | "PENDING" | "NOT_APPLICABLE";

export interface PlatformConfig {
  enabled: boolean;
  /** Values keyed by `FieldSpec.id` from the catalogue. Free-form on purpose — the catalogue owns the shape. */
  fields: Record<string, string>;
  /** Questionnaire answers keyed by `QuestionSpec.id`. `string[]` for multi-select follow-ups. */
  answers: Record<string, string | string[]>;
  status: StoreStatus;
  storeUrl: string;
  currentVersion: string;
  currentBuild: string;
  releasedAt: string;
  /** Human overrides for checklist rows (e.g. "not applicable to this client"). */
  checklistOverrides: Record<string, ChecklistOverride>;
  /** Last time a StoreProvider successfully refreshed this platform, ISO string. */
  lastSyncedAt: string;
}

/**
 * Which store track the current build sits on — Play's Internal/Closed/Open/Production, Apple's
 * TestFlight vs App Store, Microsoft's package flight vs Production.
 *
 * Deliberately NOT a field of `PlatformConfig`: it is a catalogue field (`release_track`) like
 * every other registration answer, so the option list per store lives in one place and moves when
 * a store moves. Read it through here — `fields` is absent entirely on records written before a
 * platform had any, and the institute-facing screen shows this value.
 */
export const RELEASE_TRACK_FIELD_ID = "release_track";

export function releaseTrackOf(config: PlatformConfig | undefined): string {
  return config?.fields?.[RELEASE_TRACK_FIELD_ID]?.trim() ?? "";
}

export function emptyPlatformConfig(): PlatformConfig {
  return {
    enabled: false,
    fields: {},
    answers: {},
    status: "NOT_REGISTERED",
    storeUrl: "",
    currentVersion: "",
    currentBuild: "",
    releasedAt: "",
    checklistOverrides: {},
    lastSyncedAt: "",
  };
}

/* ------------------------------------------------------------------ assets */

/** A user-uploaded original. Stored in media-service so the whole team sees the same pixels. */
export interface SourceImage {
  id: string;
  name: string;
  url: string;
  fileId: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
}

/** A store-ready derivative produced by the cropper. */
export interface GeneratedAsset {
  id: string;
  platform: Platform;
  /** `AssetSpec.id` from the catalogue. */
  specId: string;
  sourceImageId: string;
  url: string;
  fileId: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
  createdAt: string;
}

/* ---------------------------------------------------------------- versions */

export type OtaStatus = "AVAILABLE" | "PENDING" | "NONE" | "FAILED";

export interface VersionRecord {
  id: string;
  platform: Platform;
  version: string;
  build: string;
  status: StoreStatus;
  releaseNotes: string;
  submittedAt: string;
  reviewedAt: string;
  releasedAt: string;
  rejectionReason: string;
  buildLogUrl: string;
  otaStatus: OtaStatus;
  createdAt: string;
}

/* --------------------------------------------------- privacy & review info */

export interface PrivacyProfile {
  privacyPolicyUrl: string;
  termsUrl: string;
  dataDeletionUrl: string;
  accountDeletionUrl: string;
  dataRetentionPolicy: string;
  encryption: string;
  authentication: string;
  thirdPartyServices: string;
  analytics: string;
  crashReporting: string;
  advertisingSdks: string;
  paymentSdks: string;
  loginProviders: string;
  /** Security checklist answers keyed by `SECURITY_CHECKLIST[].id`. */
  security: Record<string, boolean>;
}

export interface ReviewInfo {
  /**
   * Apple's App Review Information panel asks for a named human, not a shared inbox — first name,
   * last name, phone and email are all separate required fields. Google has no equivalent.
   */
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  contactEmail: string;
  demoAccount: string;
  username: string;
  password: string;
  loginInstructions: string;
  subscriptionInstructions: string;
  testPaymentInstructions: string;
  specialFeatures: string;
  restrictedFeatures: string;
  navigationInstructions: string;
  contactInformation: string;
}

/** Generated (then human-approved) store copy. Kept per platform — Apple and Google want different lengths. */
export interface StoreContent {
  shortDescription: string;
  fullDescription: string;
  whatsNew: string;
  reviewNotes: string;
  accessInstructions: string;
  keywords: string;
  generatedAt: string;
  approved: boolean;
}

export function emptyStoreContent(): StoreContent {
  return {
    shortDescription: "",
    fullDescription: "",
    whatsNew: "",
    reviewNotes: "",
    accessInstructions: "",
    keywords: "",
    generatedAt: "",
    approved: false,
  };
}

/* ------------------------------------------------------------- submissions */

export interface SubmissionRecord {
  id: string;
  platform: Platform;
  version: string;
  build: string;
  status: StoreStatus;
  submittedAt: string;
  decidedAt: string;
  reason: string;
  notes: string;
}

/* ------------------------------------------------------------------ record */

export interface AppRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  basics: AppBasics;
  platforms: Record<Platform, PlatformConfig>;
  sourceImages: SourceImage[];
  assets: GeneratedAsset[];
  versions: VersionRecord[];
  submissions: SubmissionRecord[];
  privacy: PrivacyProfile;
  review: ReviewInfo;
  content: Partial<Record<Platform, StoreContent>>;
  archived: boolean;
}

export function emptyBasics(): AppBasics {
  return {
    name: "",
    displayName: "",
    packageName: "",
    client: "",
    instituteId: "",
    websiteUrl: "",
    supportEmail: "",
    supportPhone: "",
    developerName: "Vidyayatan Technologies",
    category: "",
    appType: "WHITE_LABEL",
    description: "",
    shortDescription: "",
    primaryLanguage: "en-IN",
    privacyPolicyUrl: "",
    termsUrl: "",
    supportUrl: "",
  };
}

export function emptyPrivacy(): PrivacyProfile {
  return {
    privacyPolicyUrl: "",
    termsUrl: "",
    dataDeletionUrl: "",
    accountDeletionUrl: "",
    dataRetentionPolicy: "",
    encryption: "",
    authentication: "",
    thirdPartyServices: "",
    analytics: "",
    crashReporting: "",
    advertisingSdks: "",
    paymentSdks: "",
    loginProviders: "",
    security: {},
  };
}

export function emptyReview(): ReviewInfo {
  return {
    contactFirstName: "",
    contactLastName: "",
    contactPhone: "",
    contactEmail: "",
    demoAccount: "",
    username: "",
    password: "",
    loginInstructions: "",
    subscriptionInstructions: "",
    testPaymentInstructions: "",
    specialFeatures: "",
    restrictedFeatures: "",
    navigationInstructions: "",
    contactInformation: "",
  };
}

export function emptyApp(id: string, now: string): AppRecord {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    basics: emptyBasics(),
    platforms: {
      ANDROID: emptyPlatformConfig(),
      IOS: emptyPlatformConfig(),
      WINDOWS: emptyPlatformConfig(),
      MACOS: emptyPlatformConfig(),
    },
    sourceImages: [],
    assets: [],
    versions: [],
    submissions: [],
    privacy: emptyPrivacy(),
    review: emptyReview(),
    content: {},
    archived: false,
  };
}

/** Platforms the app has actually opted into. */
export function activePlatforms(app: AppRecord): Platform[] {
  return PLATFORMS.filter((p) => app.platforms[p].enabled);
}
