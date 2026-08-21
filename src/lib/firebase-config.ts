/**
 * Verifies a Firebase config file actually belongs to the app it's about to ship inside.
 *
 * The failure this exists to prevent: a `GoogleService-Info.plist` left at the template default,
 * or copied from a sibling client, is a perfectly valid file — it just names the wrong bundle. iOS
 * aborts at `FirebaseApp.configure()`, so the app dies on the splash screen for every user, and
 * nothing in the store pipeline catches it. Both files carry the bundle/package in plain text, so
 * the check is a string comparison we can do the moment the file is picked.
 *
 * These files are NOT secrets — they're embedded in every shipped binary and Firebase expects them
 * to be public (security comes from Security Rules). They are still never uploaded anywhere by
 * this module: parsing happens in the browser and only the identifiers are kept.
 */

export type FirebaseConfigKind = "IOS_PLIST" | "ANDROID_JSON";

export interface FirebaseConfigFacts {
  kind: FirebaseConfigKind;
  projectId: string;
  /** Every bundle id / package name the file declares. Android files can carry several. */
  identifiers: string[];
  appId: string;
  storageBucket: string;
  senderId: string;
}

export type VerificationVerdict = "MATCH" | "MISMATCH" | "PLACEHOLDER" | "UNPARSEABLE";

export interface FirebaseVerification {
  verdict: VerificationVerdict;
  facts: FirebaseConfigFacts | null;
  /** Plain-English summary shown to the user. */
  message: string;
  /** What the app record says it should be. */
  expected: string;
}

/** Markers that betray a template or another project's file. */
const PLACEHOLDER_MARKERS = [
  "com.example",
  "your-project",
  "your_project",
  "yourcompany",
  "placeholder",
  "changeme",
  "example.com",
  "todo",
  "xxxx",
];

function looksLikePlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

/* ------------------------------------------------------------------ parsing */

/**
 * Minimal Apple plist reader for the flat `<dict>` of scalars Firebase emits.
 *
 * Deliberately not `DOMParser`: that only exists in a browser, which would make this function
 * untestable and tie a pure parsing routine to the DOM. A scanner over the key/value pairs is
 * enough for this file shape and behaves identically everywhere.
 */
export function parsePlist(xml: string): Record<string, string> | null {
  if (!xml.includes("<plist") || !xml.includes("<dict>")) return null;

  const pair =
    /<key>([\s\S]*?)<\/key>\s*(?:<string>([\s\S]*?)<\/string>|<(true|false)\s*\/>|<integer>([\s\S]*?)<\/integer>|<real>([\s\S]*?)<\/real>)/g;

  const out: Record<string, string> = {};
  let match: RegExpExecArray | null;
  while ((match = pair.exec(xml)) !== null) {
    const key = decodeXml(match[1]).trim();
    if (!key) continue;
    const value = match[2] ?? match[3] ?? match[4] ?? match[5] ?? "";
    out[key] = decodeXml(value).trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    // Ampersand last, so an encoded &amp;lt; doesn't get double-decoded.
    .replace(/&amp;/g, "&");
}

export function readIosPlist(xml: string): FirebaseConfigFacts | null {
  const dict = parsePlist(xml);
  if (!dict || (!dict.BUNDLE_ID && !dict.PROJECT_ID)) return null;
  return {
    kind: "IOS_PLIST",
    projectId: dict.PROJECT_ID ?? "",
    identifiers: dict.BUNDLE_ID ? [dict.BUNDLE_ID] : [],
    appId: dict.GOOGLE_APP_ID ?? "",
    storageBucket: dict.STORAGE_BUCKET ?? "",
    senderId: dict.GCM_SENDER_ID ?? "",
  };
}

export function readAndroidJson(text: string): FirebaseConfigFacts | null {
  let json: {
    project_info?: { project_id?: string; project_number?: string; storage_bucket?: string };
    client?: Array<{
      client_info?: { mobilesdk_app_id?: string; android_client_info?: { package_name?: string } };
    }>;
  };
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json.project_info && !json.client) return null;

  const clients = json.client ?? [];
  return {
    kind: "ANDROID_JSON",
    projectId: json.project_info?.project_id ?? "",
    // A single google-services.json legitimately covers several package names.
    identifiers: clients
      .map((c) => c.client_info?.android_client_info?.package_name ?? "")
      .filter(Boolean),
    appId: clients[0]?.client_info?.mobilesdk_app_id ?? "",
    storageBucket: json.project_info?.storage_bucket ?? "",
    senderId: json.project_info?.project_number ?? "",
  };
}

/* -------------------------------------------------------------- verification */

/**
 * Compares the file against the bundle id / package the app record claims.
 * `expected` is the single fact that decides whether the app launches.
 */
export function verifyFirebaseConfig(fileName: string, content: string, expected: string): FirebaseVerification {
  const isJson = fileName.toLowerCase().endsWith(".json") || content.trimStart().startsWith("{");
  const facts = isJson ? readAndroidJson(content) : readIosPlist(content);

  if (!facts) {
    return {
      verdict: "UNPARSEABLE",
      facts: null,
      expected,
      message: isJson
        ? "That isn't a google-services.json — no project_info or client section found."
        : "That isn't a GoogleService-Info.plist — no BUNDLE_ID or PROJECT_ID found.",
    };
  }

  const placeholderHit =
    looksLikePlaceholder(facts.projectId) || facts.identifiers.some(looksLikePlaceholder);
  if (placeholderHit) {
    return {
      verdict: "PLACEHOLDER",
      facts,
      expected,
      message: `This is a template file — it names "${facts.identifiers[0] || facts.projectId}". Download the real one from the client's Firebase project.`,
    };
  }

  if (!expected.trim()) {
    return {
      verdict: "MISMATCH",
      facts,
      expected,
      message: `File is for ${facts.identifiers.join(", ") || "an unnamed app"} in project "${facts.projectId}", but this app has no bundle id / package name set yet. Fill that in first.`,
    };
  }

  if (facts.identifiers.includes(expected)) {
    return {
      verdict: "MATCH",
      facts,
      expected,
      message: `Verified — ${expected} in Firebase project "${facts.projectId}".`,
    };
  }

  return {
    verdict: "MISMATCH",
    facts,
    expected,
    message: `Wrong file. It is for ${facts.identifiers.join(", ") || "(no bundle id)"} but this app is ${expected}. Shipping this crashes the app on launch.`,
  };
}
