/** US dollars the same way balances.money writes them: $1,234.56, and $0.000123 for a fraction of a cent. */
export const usd = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency", currency: "USD", minimumFractionDigits: 2,
        maximumFractionDigits: n !== 0 && Math.abs(n) < 0.01 ? 6 : 2,
      }).format(n);

export const credits = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const count = (n: number | null | undefined) => Number(n ?? 0).toLocaleString();

export const dateTime = (v: string) => new Date(v).toLocaleString();

const VENDOR_NAMES: Record<string, string> = {
  openrouter: "OpenRouter",
  isoquant: "Isoquant",
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
  google: "Google",
  sarvam: "Sarvam",
  smallest: "Smallest.ai",
  fal: "fal.ai",
  runpod: "RunPod",
  serper: "Serper",
  plivo: "Plivo",
  exotel: "Exotel",
  airtel: "Airtel",
  aavtaar: "Aavtaar",
  razorpay: "Razorpay",
  stripe: "Stripe",
  phonepe: "PhonePe",
  cashfree: "Cashfree",
  eway: "Eway",
  paypal: "PayPal",
  whatsapp: "WhatsApp",
  email: "Email",
  voice_bot: "Voice bot stack",
  vacademy_ai: "Vacademy AI calling (Plivo)",
  speech: "Speech vendor",
  stock_media: "Pexels, Pixabay",
};

const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** Prefix on vendor values the query derived from the model name, because no route was recorded. */
export const MODEL_VENDOR_PREFIX = "model:";
/** Prefix on vendors worked out from the route map or the feature, not recorded on the call. */
export const LIKELY_VENDOR_PREFIX = "likely:";
export const NO_VENDOR = "none";
/** Prefix on usage with no vendor at all, followed by the feature that used it. */
export const NO_VENDOR_PREFIX = "none:";

/** A vendor as people call it. Hosts stay as they are, since they are already precise. */
/**
 * The third-party APIs the platform has integrated, by the hosts they answer on. Only these
 * are shown as vendor calls: any other site an HTTP client reached (an institute's website
 * fetched for lead research) is not an integration. Same list in ai_service integrated_vendors.py,
 * voice_bot vendor_failures.py and admin_core IntegratedVendors.java.
 */
export const INTEGRATED_VENDORS: Array<{ name: string; domains: string[] }> = [
  { name: "OpenRouter", domains: ["openrouter.ai"] },
  { name: "Isoquant", domains: ["api.isoquant.ai"] },
  { name: "Anthropic", domains: ["api.anthropic.com"] },
  { name: "OpenAI", domains: ["api.openai.com"] },
  { name: "Google AI", domains: ["generativelanguage.googleapis.com", "aiplatform.googleapis.com"] },
  { name: "Parallel", domains: ["api.parallel.ai"] },
  { name: "Sarvam", domains: ["api.sarvam.ai"] },
  { name: "Smallest.ai", domains: ["smallest.ai"] },
  { name: "Navana", domains: ["navana.ai"] },
  { name: "Rumik", domains: ["rumik.ai"] },
  { name: "Deepgram", domains: ["deepgram.com"] },
  { name: "Google speech", domains: ["texttospeech.googleapis.com", "speech.googleapis.com"] },
  { name: "Edge TTS", domains: ["speech.platform.bing.com"] },
  { name: "fal.ai", domains: ["fal.run", "fal.ai", "fal.media"] },
  { name: "RunPod", domains: ["runpod.ai", "runpod.io"] },
  { name: "Spatius", domains: ["spatius.ai"] },
  { name: "Mathpix", domains: ["api.mathpix.com"] },
  { name: "DocConverter", domains: ["api.docconverter.pro"] },
  { name: "CloudConvert", domains: ["cloudconvert.com"] },
  { name: "Serper", domains: ["google.serper.dev"] },
  { name: "Pexels", domains: ["api.pexels.com"] },
  { name: "Pixabay", domains: ["pixabay.com"] },
  { name: "Google APIs", domains: ["www.googleapis.com", "oauth2.googleapis.com", "meet.googleapis.com", "workspaceevents.googleapis.com"] },
  { name: "Plivo", domains: ["api.plivo.com"] },
  { name: "Exotel", domains: ["exotel.com", "exotel.in"] },
  { name: "Vonage / Airtel", domains: ["api.vonage.com", "api.nexmo.com"] },
  { name: "Aavtaar", domains: ["aavtaar.ai"] },
  { name: "Razorpay", domains: ["api.razorpay.com"] },
  { name: "Cashfree", domains: ["api.cashfree.com", "sandbox.cashfree.com"] },
  { name: "Stripe", domains: ["api.stripe.com"] },
  { name: "PhonePe", domains: ["api.phonepe.com", "api-preprod.phonepe.com"] },
  { name: "PayPal", domains: ["api.paypal.com", "api-m.paypal.com", "api.sandbox.paypal.com", "api-m.sandbox.paypal.com"] },
  { name: "Eway", domains: ["ewaypayments.com"] },
  { name: "WATI", domains: ["wati.io"] },
  { name: "Meta", domains: ["graph.facebook.com"] },
  { name: "Zoom", domains: ["api.zoom.us", "zoom.us"] },
  { name: "Zoho", domains: ["zohoapis.in", "zohoapis.com", "zoho.in"] },
  { name: "Cloudflare", domains: ["api.cloudflare.com"] },
  { name: "FX rates", domains: ["open.er-api.com"] },
];

/** The integrated vendor a host belongs to, or null when it is not an integration. */
export const integratedVendor = (host: string | null | undefined): string | null => {
  const h = (host ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!h) return null;
  for (const v of INTEGRATED_VENDORS) {
    if (v.domains.some((d) => h === d || h.endsWith(`.${d}`))) return v.name;
  }
  return null;
};

export const vendorName = (raw: string | null | undefined): string => {
  if (!raw || raw === NO_VENDOR || raw === "unknown") return "Vendor not tracked";
  if (raw.startsWith(NO_VENDOR_PREFIX)) return `${raw.slice(NO_VENDOR_PREFIX.length)} (vendor not tracked)`;
  if (raw.startsWith(LIKELY_VENDOR_PREFIX)) {
    return `${vendorName(raw.slice(LIKELY_VENDOR_PREFIX.length))} (likely)`;
  }
  if (raw.startsWith(MODEL_VENDOR_PREFIX)) {
    return `${vendorName(raw.slice(MODEL_VENDOR_PREFIX.length))} model, route not recorded`;
  }
  const known = VENDOR_NAMES[raw.toLowerCase()];
  if (known) return known;
  const integrated = integratedVendor(raw);
  if (integrated) return integrated;
  if (raw === "bedrock (AWS)") return "AWS Bedrock";
  return /^[A-Z_]+$/.test(raw) ? raw.split("_").map(titleCase).join(" ") : raw;
};

const SOURCE_LABELS: Record<string, string> = {
  ai: "AI call",
  calls: "Vendor call",
  telephony: "Telephony",
  payments: "Payment",
  webhooks: "Webhook",
};

/** Which table a call came from, in words. */
export const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? humanize(source);

/** NO_ANSWER and course_generation become readable. "POST /v1/x" and the like are left alone. */
export const humanize = (raw: string | null | undefined): string => {
  if (!raw) return "—";
  if (!/^[A-Za-z0-9_]+$/.test(raw) || (!raw.includes("_") && raw !== raw.toUpperCase())) return raw;
  const text = raw.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const CHARGE_LABELS: Record<string, string> = {
  POSTED: "Charged",
  DROPPED_INSUFFICIENT: "Not charged: out of credits",
  SKIPPED_NO_INSTITUTE: "Not charged: no institute",
  NOT_APPLICABLE: "Free",
  REFUNDED: "Refunded",
  PARTIAL_REFUND: "Partly refunded",
};

export const chargeLabel = (status: string) => CHARGE_LABELS[status] ?? humanize(status);

export const windowLabel = (hours: number) => {
  if (hours === 1) return "the last hour";
  if (hours < 48) return `the last ${hours} hours`;
  return `the last ${Math.round(hours / 24)} days`;
};

/** What went wrong and what to do about it, in words someone can act on. */
export const explainError = (error: unknown): string => {
  const e = error as {
    code?: string;
    response?: { status?: number; data?: unknown };
  };
  const status = e?.response?.status;
  const data = e?.response?.data as { error?: unknown; detail?: unknown; message?: unknown } | undefined;
  const raw = [data?.error, data?.detail, data?.message].find((v) => typeof v === "string") as string | undefined;
  const said = raw && raw.length <= 200 ? ` The server said: ${raw}` : "";

  if (status == null) {
    return e?.code === "ECONNABORTED"
      ? "The server took too long to answer. Try a shorter time range."
      : "Could not reach the server. Check your connection and try again.";
  }
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) {
    return "Your account does not have super-admin access to this. Ask an engineer to grant it.";
  }
  if (status === 404) return `This is not on the server yet, or the record no longer exists.${said}`;
  if (status === 408 || status === 504) return "This took too long to load. Try a shorter time range.";
  if (raw && /does not exist/i.test(raw)) {
    return "A database table this needs is not there yet, so the latest database migration may not have run.";
  }
  if (status >= 500) return `The server hit an error (${status}). Try again, and check the service logs if it keeps happening.${said}`;
  return `The request was refused (${status}).${said}`;
};

/** Filter options from what is on screen, keeping the active filter when no row matches it. */
export const optionsFrom = (values: Array<string | null | undefined>, selected?: string) =>
  [...new Set([...values, selected].filter((v): v is string => !!v))].sort();

const SERVICE_NAMES: Record<string, string> = {
  ai: "AI service",
  ai_service: "AI service",
  "admin-core": "Main app",
  admin_core: "Main app",
  admin_core_service: "Main app",
  notification: "Messaging service",
  notification_service: "Messaging service",
  media: "File service",
  media_service: "File service",
  assessment: "Assessments",
  community: "Community",
  "voice-bot": "Voice bot",
  auth: "Sign-in",
};

/** Our own services by what they do, not their code names. "ai, admin-core" becomes "AI service, Main app". */
export const serviceName = (raw: string | null | undefined): string =>
  !raw
    ? "—"
    : raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => SERVICE_NAMES[s.toLowerCase()] ?? humanize(s))
        .join(", ");

/** Where an institute's own credential is kept, in words. */
export const instituteKeyKind = (credential: string): string =>
  ({
    ai_api_keys: "Their own AI key",
    institute_payment_gateway_mapping: "Payment gateway",
    institute_telephony_config: "Telephony account",
  })[credential] ?? humanize(credential);

/** A platform key by its label: a stored key keeps its label, an environment key is "Main key". */
export const keyLabel = (credential: string): string => {
  const stored = credential.match(/^llm_provider_keys:\s*(.+)$/);
  if (stored) return `Stored key "${stored[1]}"`;
  return /_KEYS$/.test(credential) ? "Key pool" : "Main key";
};
