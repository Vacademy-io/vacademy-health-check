// Every third-party API the platform calls, from a scan of vacademy_platform on 2026-11-05.
// Key names only — never put a key's value here, this ships in the browser bundle.

/** What we keep per call: both bodies, some of it, cost metadata only, nothing, or not yet checked. */
export type CaptureLevel = "full" | "partial" | "metered" | "none" | "unverified";
/** Whether a call deducts institute credits. */
export type BillingLevel = "credits" | "partial" | "none" | "unverified";

export interface ExternalVendor {
  name: string;
  category: string;
  services: string;
  keyConfig: string;
  capture: CaptureLevel;
  /** Where the capture goes, when there is any. */
  store?: string;
  billing: BillingLevel;
}

export const CAPTURE_LABELS: Record<CaptureLevel, string> = {
  full: "Every call, with what was sent and received",
  partial: "Some of each call",
  metered: "Each call and its cost",
  none: "Nothing",
  unverified: "Not verified",
};

export const BILLING_LABELS: Record<BillingLevel, string> = {
  credits: "Yes, in credits",
  partial: "For some features",
  none: "No",
  unverified: "Not verified",
};

/**
 * Names a catalog vendor is logged under. A logged vendor that matches nothing here shows as
 * new on the All vendors tab, which is the cue to add it to the list below.
 */
export const VENDOR_LOG_NAMES: Record<string, string[]> = {
  OpenRouter: ["openrouter.ai"],
  Isoquant: ["api.isoquant.ai"],
  Anthropic: ["api.anthropic.com"],
  "OpenAI, Gemini (sound catalog)": ["api.openai.com", "generativelanguage.googleapis.com"],
  Sarvam: ["api.sarvam.ai"],
  "Smallest.ai": ["api.smallest.ai", "waves-api.smallest.ai"],
  "fal.ai": ["queue.fal.run", "fal.run"],
  RunPod: ["api.runpod.ai"],
  Spatius: ["console.spatius.ai"],
  Mathpix: ["api.mathpix.com"],
  Serper: ["serper", "google.serper.dev"],
  "Pexels, Pixabay": ["api.pexels.com", "pixabay.com"],
  "YouTube Data": ["www.googleapis.com"],
};

export const EXTERNAL_VENDORS: ExternalVendor[] = [
  // LLM
  { name: "OpenRouter", category: "LLM", services: "ai, admin-core, assessment, community", keyConfig: "OPENROUTER_API_KEY, openrouter.api.key", capture: "metered", store: "ai_usage_event, ai_token_usage", billing: "partial" },
  { name: "Isoquant", category: "LLM", services: "ai, admin-core", keyConfig: "ISOQUANT_API_KEY, isoquant.api.key", capture: "metered", store: "ai_usage_event, ai_token_usage", billing: "partial" },
  { name: "Anthropic", category: "LLM", services: "ai", keyConfig: "DB llm_provider_keys (encrypted)", capture: "metered", store: "ai_usage_event, llm_key_spend", billing: "partial" },
  { name: "OpenAI, Gemini (sound catalog)", category: "LLM", services: "ai", keyConfig: "OPENAI_API_KEY, GEMINI_API_KEY", capture: "none", billing: "none" },

  // Voice and media generation
  { name: "Sarvam", category: "Voice & media", services: "ai, voice-bot", keyConfig: "SARVAM_API_KEY", capture: "unverified", billing: "unverified" },
  { name: "Smallest.ai", category: "Voice & media", services: "ai, voice-bot", keyConfig: "SMALLEST_API_KEY", capture: "unverified", billing: "unverified" },
  { name: "Google Cloud TTS / STT", category: "Voice & media", services: "ai, voice-bot", keyConfig: "GOOGLE_APPLICATION_CREDENTIALS_JSON", capture: "unverified", billing: "unverified" },
  { name: "Deepgram, Navana, Rumik, Bedrock", category: "Voice & media", services: "voice-bot", keyConfig: "voice_bot_service/app/config.py", capture: "partial", store: "ai_call_result (per call, not per vendor request)", billing: "unverified" },
  { name: "Vertex Lyria", category: "Voice & media", services: "ai", keyConfig: "GOOGLE_APPLICATION_CREDENTIALS_JSON", capture: "unverified", billing: "unverified" },
  { name: "fal.ai", category: "Voice & media", services: "ai", keyConfig: "FAL_API_KEY", capture: "unverified", billing: "unverified" },
  { name: "RunPod", category: "Voice & media", services: "ai", keyConfig: "runpod_api_key, runpod_endpoint_id", capture: "unverified", billing: "unverified" },
  { name: "Spatius", category: "Voice & media", services: "ai", keyConfig: "SPATIUS_API_KEY", capture: "unverified", billing: "unverified" },

  // Content and search
  { name: "Mathpix", category: "Content & search", services: "ai, assessment", keyConfig: "MATHPIX_APP_ID, MATHPIX_APP_KEY", capture: "none", billing: "unverified" },
  { name: "Serper", category: "Content & search", services: "ai", keyConfig: "SERPER_API_KEYS", capture: "partial", store: "external_api_call_log (query and result counts)", billing: "unverified" },
  { name: "Pexels, Pixabay", category: "Content & search", services: "ai", keyConfig: "PEXELS_API_KEYS, PIXABAY_API_KEYS", capture: "none", billing: "unverified" },
  { name: "YouTube Data", category: "Content & search", services: "ai", keyConfig: "youtube_api_key", capture: "unverified", billing: "unverified" },
  { name: "CloudConvert, DocConverter", category: "Content & search", services: "media", keyConfig: "CLOUD_CONVERT_KEY", capture: "partial", store: "status tables only", billing: "none" },

  // Messaging
  { name: "WATI bulk send", category: "Messaging", services: "notification", keyConfig: "DB institute settings", capture: "full", store: "external_communication_logs", billing: "none" },
  { name: "WATI chatbot", category: "Messaging", services: "notification", keyConfig: "DB institute settings", capture: "none", billing: "none" },
  { name: "Meta WhatsApp Cloud API", category: "Messaging", services: "notification", keyConfig: "whatsapp.access-token, DB institute settings", capture: "partial", store: "notification_log (body, no vendor response)", billing: "none" },
  { name: "Com.bot", category: "Messaging", services: "notification", keyConfig: "DB institute settings", capture: "none", billing: "none" },
  { name: "Email (SES SMTP)", category: "Messaging", services: "notification", keyConfig: "AWS_MAIL_USERNAME, AWS_MAIL_PASSWORD, per-institute SMTP", capture: "partial", store: "notification_log (no SMTP response)", billing: "none" },
  { name: "Firebase Cloud Messaging", category: "Messaging", services: "notification", keyConfig: "DB firebase service account", capture: "none", billing: "none" },

  // Payments
  { name: "Stripe", category: "Payments", services: "admin-core", keyConfig: "DB per institute", capture: "partial", store: "web_hook (inbound), payment_log", billing: "none" },
  { name: "Razorpay", category: "Payments", services: "admin-core", keyConfig: "DB per institute", capture: "partial", store: "web_hook (inbound), payment_log", billing: "none" },
  { name: "PhonePe", category: "Payments", services: "admin-core", keyConfig: "DB per institute", capture: "partial", store: "web_hook (inbound), payment_log", billing: "none" },
  { name: "Cashfree PG", category: "Payments", services: "admin-core", keyConfig: "DB per institute", capture: "partial", store: "web_hook (inbound), payment_log", billing: "none" },
  { name: "Eway", category: "Payments", services: "admin-core", keyConfig: "DB per institute", capture: "partial", store: "payment_log", billing: "none" },
  { name: "PayPal", category: "Payments", services: "admin-core", keyConfig: "Not verified", capture: "unverified", billing: "none" },
  { name: "Cashfree Secure ID", category: "Payments", services: "admin-core", keyConfig: "cashfree.secureid.*", capture: "none", billing: "none" },
  { name: "open.er-api.com (FX rates)", category: "Payments", services: "admin-core", keyConfig: "regional.pricing.fx.url", capture: "none", billing: "none" },

  // Telephony
  { name: "Plivo", category: "Telephony", services: "admin-core", keyConfig: "telephony.plivo.base-url, credentials object", capture: "partial", store: "telephony_call_log.raw_payload_json", billing: "credits" },
  { name: "Exotel", category: "Telephony", services: "admin-core", keyConfig: "telephony.exotel.base-url", capture: "partial", store: "telephony_call_log.raw_payload_json", billing: "none" },
  { name: "Airtel via Vonage", category: "Telephony", services: "admin-core", keyConfig: "telephony.airtel.s3.*", capture: "partial", store: "airtel_call_import", billing: "none" },
  { name: "Aavtaar", category: "Telephony", services: "admin-core", keyConfig: "aavtaar.api.token, aavtaar.api.company-code", capture: "partial", store: "ai_call_result", billing: "unverified" },

  // Meetings
  { name: "Zoom", category: "Meetings", services: "admin-core", keyConfig: "zoom.app.client-id, per-institute tokens", capture: "none", billing: "none" },
  { name: "Google Meet, Calendar, Drive", category: "Meetings", services: "admin-core", keyConfig: "google.oauth.*", capture: "none", billing: "none" },
  { name: "Zoho Meeting", category: "Meetings", services: "admin-core", keyConfig: "Not verified", capture: "none", billing: "none" },
  { name: "BigBlueButton (self-hosted)", category: "Meetings", services: "admin-core, community", keyConfig: "DB bbb_server_pool", capture: "none", billing: "none" },
  { name: "YouTube upload", category: "Meetings", services: "admin-core", keyConfig: "Not verified", capture: "none", billing: "none" },

  // Infrastructure and integrations
  { name: "AWS S3, CloudFront", category: "Infra & integrations", services: "media, ai", keyConfig: "S3_AWS_ACCESS_KEY, S3_AWS_ACCESS_SECRET, cdn.*", capture: "none", billing: "none" },
  { name: "Cloudflare", category: "Infra & integrations", services: "admin-core", keyConfig: "cloudflare.api.token, cloudflare.zone.id", capture: "none", billing: "none" },
  { name: "Meta Lead Ads", category: "Infra & integrations", services: "admin-core", keyConfig: "meta.app.id, meta.app.secret", capture: "none", billing: "none" },
  { name: "Moodle, LearnDash", category: "Infra & integrations", services: "admin-core", keyConfig: "DB institute setting", capture: "none", billing: "none" },
  { name: "Workflow and AI-call webhooks", category: "Infra & integrations", services: "admin-core", keyConfig: "Per configuration", capture: "partial", store: "workflow_execution_log, ai_call_api_call", billing: "none" },
  { name: "Apple, Google Play, Microsoft stores", category: "Infra & integrations", services: "community", keyConfig: "Env or DB, see StoreCredentialResolver", capture: "none", billing: "none" },
  { name: "Google, GitHub OAuth", category: "Infra & integrations", services: "auth", keyConfig: "GOOGLE_CLIENT_ID, OAUTH_GITHUB_CLIENT_ID", capture: "none", billing: "none" },
];
