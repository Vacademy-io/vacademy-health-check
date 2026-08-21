/**
 * Store provider abstraction (§19).
 *
 *   StoreProvider
 *     ├── GooglePlayProvider      (Play Developer API, service account)
 *     ├── AppStoreConnectProvider (App Store Connect API, JWT-signed .p8)
 *     ├── MicrosoftStoreProvider  (Partner Center submission API, Azure AD)
 *     └── MacAppStoreProvider     (App Store Connect API, macOS platform filter)
 *
 * Two rules this layer never breaks:
 *
 * 1. **Every call is proxied through our backend.** Signing an App Store Connect JWT or holding a
 *    Google service-account key in a browser would put the private key in front of anyone with
 *    devtools. The dashboard asks our server; our server holds the secret and talks to the store.
 *
 * 2. **No API, no automation.** Where an official API genuinely cannot do something — reserving a
 *    Play listing, the first Partner Center submission — the provider returns `manual: true` with
 *    an explanation and a deep link. It does not drive the store's web console, reuse a browser
 *    session, or call undocumented endpoints (§28).
 */

import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import { PROVIDER_CAPABILITIES, type ProviderCapabilities } from "@/lib/platform-requirements";
import { REMOTE_ENABLED } from "@/services/app-registry-store";
import type { OtaStatus, Platform, StoreStatus } from "@/types/app-registry";

export type ProviderOperation = keyof ProviderCapabilities;

/** Every provider call answers with one of these — never a thrown error for "not supported". */
export interface ProviderResult<T> {
  ok: boolean;
  data?: T;
  /** True when the store offers no official API for this operation and a person must do it. */
  manual: boolean;
  message: string;
  /** Where to go to do it by hand. */
  consoleUrl?: string;
}

export interface AppStatusResult {
  status: StoreStatus;
  version: string;
  build: string;
  releasedAt: string;
  otaStatus: OtaStatus;
  storeUrl: string;
}

export const CONSOLE_URLS: Record<Platform, string> = {
  ANDROID: "https://play.google.com/console",
  IOS: "https://appstoreconnect.apple.com",
  WINDOWS: "https://partner.microsoft.com/dashboard",
  MACOS: "https://appstoreconnect.apple.com",
};

export interface StoreProvider {
  platform: Platform;
  name: string;
  capabilities: ProviderCapabilities;
  supports(op: ProviderOperation): boolean;
  getAppStatus(appId: string): Promise<ProviderResult<AppStatusResult>>;
  getLatestVersion(appId: string): Promise<ProviderResult<{ version: string; build: string }>>;
  getBuildStatus(appId: string): Promise<ProviderResult<{ status: StoreStatus; logUrl?: string }>>;
  getReleaseStatus(appId: string): Promise<ProviderResult<{ status: StoreStatus; releasedAt: string }>>;
  getSubmissionStatus(appId: string): Promise<ProviderResult<{ status: StoreStatus; reason?: string }>>;
  getReviews(appId: string): Promise<ProviderResult<Array<{ rating: number; title: string; body: string; at: string }>>>;
}

function manualResult<T>(platform: Platform, reason: string): ProviderResult<T> {
  return {
    ok: false,
    manual: true,
    message: reason,
    consoleUrl: CONSOLE_URLS[platform],
    data: undefined,
  } as ProviderResult<T>;
}

/**
 * Shared implementation: capability check, then a call to our own backend proxy.
 * Subclassing buys nothing here — the four providers differ only in configuration, and the
 * store-specific request signing lives on the server where the keys are.
 */
class ProxyStoreProvider implements StoreProvider {
  readonly platform: Platform;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  private readonly notes: string;

  constructor(platform: Platform, name: string, capabilities: ProviderCapabilities, notes: string) {
    this.platform = platform;
    this.name = name;
    this.capabilities = capabilities;
    this.notes = notes;
  }

  supports(op: ProviderOperation): boolean {
    return this.capabilities[op];
  }

  private async call<T>(op: ProviderOperation, appId: string): Promise<ProviderResult<T>> {
    if (!this.supports(op)) {
      return manualResult<T>(
        this.platform,
        `${this.name} has no official API for this. ${this.notes} Do it in the store console.`
      );
    }
    if (!REMOTE_ENABLED) {
      return manualResult<T>(
        this.platform,
        `Live status needs the server-side ${this.name} integration, which isn't deployed yet. The store credential must stay on the server, so this can't run from the browser. Check the console and record the result here.`
      );
    }
    try {
      const { data } = await api.get<T>(
        `${API_PREFIXES.APP_REGISTRY}/providers/${this.platform.toLowerCase()}/${appId}/${op}`
      );
      return { ok: true, data, manual: false, message: "Synced from the store." };
    } catch (error) {
      // The backend answers 501 with `manual: true` when a provider isn't wired up yet. That's a
      // "go and do it by hand" answer, not a fault — surfacing it as an error would train people
      // to ignore genuine credential failures.
      const response = (error as { response?: { status?: number; data?: { message?: string; consoleUrl?: string } } })
        .response;
      if (response?.status === 501) {
        return {
          ok: false,
          manual: true,
          message: response.data?.message ?? `${this.name} isn't configured on the server yet.`,
          consoleUrl: response.data?.consoleUrl ?? CONSOLE_URLS[this.platform],
        };
      }
      const detail = error instanceof Error ? error.message : "Unknown error";
      return {
        ok: false,
        manual: false,
        message: `${this.name} call failed: ${detail}. Check the integration credential hasn't expired.`,
        consoleUrl: CONSOLE_URLS[this.platform],
      };
    }
  }

  getAppStatus(appId: string) {
    return this.call<AppStatusResult>("getAppStatus", appId);
  }
  getLatestVersion(appId: string) {
    return this.call<{ version: string; build: string }>("getLatestVersion", appId);
  }
  getBuildStatus(appId: string) {
    return this.call<{ status: StoreStatus; logUrl?: string }>("getBuildStatus", appId);
  }
  getReleaseStatus(appId: string) {
    return this.call<{ status: StoreStatus; releasedAt: string }>("getReleaseStatus", appId);
  }
  getSubmissionStatus(appId: string) {
    return this.call<{ status: StoreStatus; reason?: string }>("getSubmissionStatus", appId);
  }
  getReviews(appId: string) {
    return this.call<Array<{ rating: number; title: string; body: string; at: string }>>("getReviews", appId);
  }
}

const REGISTRY: Record<Platform, StoreProvider> = {
  ANDROID: new ProxyStoreProvider(
    "ANDROID",
    "GooglePlayProvider",
    PROVIDER_CAPABILITIES.ANDROID.capabilities,
    PROVIDER_CAPABILITIES.ANDROID.notes
  ),
  IOS: new ProxyStoreProvider(
    "IOS",
    "AppStoreConnectProvider",
    PROVIDER_CAPABILITIES.IOS.capabilities,
    PROVIDER_CAPABILITIES.IOS.notes
  ),
  WINDOWS: new ProxyStoreProvider(
    "WINDOWS",
    "MicrosoftStoreProvider",
    PROVIDER_CAPABILITIES.WINDOWS.capabilities,
    PROVIDER_CAPABILITIES.WINDOWS.notes
  ),
  MACOS: new ProxyStoreProvider(
    "MACOS",
    "MacAppStoreProvider",
    PROVIDER_CAPABILITIES.MACOS.capabilities,
    PROVIDER_CAPABILITIES.MACOS.notes
  ),
};

export function providerFor(platform: Platform): StoreProvider {
  return REGISTRY[platform];
}
