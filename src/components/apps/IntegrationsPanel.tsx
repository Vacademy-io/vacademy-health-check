import { useState } from "react";
import { Check, ExternalLink, KeyRound, Minus, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_ICONS } from "@/components/apps/StatusBadge";
import { PROVIDER_CAPABILITIES, type ProviderCapabilities } from "@/lib/platform-requirements";
import { readIntegrations, writeIntegration, type IntegrationRecord } from "@/services/app-registry-store";
import { PLATFORMS, STORE_LABELS, type Platform } from "@/types/app-registry";

const OPERATION_LABELS: Array<{ key: keyof ProviderCapabilities; label: string }> = [
  { key: "getAppStatus", label: "getAppStatus()" },
  { key: "getLatestVersion", label: "getLatestVersion()" },
  { key: "getBuildStatus", label: "getBuildStatus()" },
  { key: "getReleaseStatus", label: "getReleaseStatus()" },
  { key: "getSubmissionStatus", label: "getSubmissionStatus()" },
  { key: "getReviews", label: "getReviews()" },
  { key: "createListing", label: "Create listing" },
  { key: "submitForReview", label: "Submit for review" },
];

/** Captured once at module load — reading the clock during render is impure. */
const LOADED_AT = Date.now();
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function blank(platform: Platform): IntegrationRecord {
  return {
    platform,
    accountName: "",
    publicIdentifier: "",
    secretRef: "",
    expiresAt: "",
    notes: "",
    updatedAt: "",
  };
}

/**
 * Developer Accounts / Integrations (§20) and the provider capability matrix (§19).
 *
 * Only public identifiers are captured here. Private keys, client secrets and service-account
 * JSON stay on the server, encrypted at rest, and this screen holds nothing more than the *name*
 * of the secret to look for. There is deliberately no field for a browser cookie or session
 * token — reusing one would be exactly the sort of store-console bypass §28 rules out.
 */
export function IntegrationsPanel({
  notify,
}: {
  notify: (tone: "success" | "error" | "info", text: string) => void;
}) {
  const [records, setRecords] = useState(() => readIntegrations());

  function save(record: IntegrationRecord) {
    writeIntegration(record);
    setRecords(readIntegrations());
    notify("success", `${STORE_LABELS[record.platform]} account details saved.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">Secrets never go in this form.</p>
          <p className="text-xs leading-relaxed">
            Store the .p8 private key, the Google service-account JSON and the Azure client secret on the server,
            encrypted at rest, and put only the name you gave them in "Server secret reference". Anything typed into
            this page is visible to anyone who opens the dashboard. Store credentials are never obtained by copying
            browser cookies or session tokens — only through official OAuth, service accounts and API keys.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {PLATFORMS.map((platform) => (
          <ProviderCard
            key={platform}
            platform={platform}
            record={records[platform] ?? blank(platform)}
            onSave={save}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderCard({
  platform,
  record,
  onSave,
}: {
  platform: Platform;
  record: IntegrationRecord;
  onSave: (record: IntegrationRecord) => void;
}) {
  const meta = PROVIDER_CAPABILITIES[platform];
  const Icon = PLATFORM_ICONS[platform];
  const [draft, setDraft] = useState(record);
  const set = (patch: Partial<IntegrationRecord>) => setDraft({ ...draft, ...patch });

  const expiringSoon = Boolean(
    draft.expiresAt && new Date(draft.expiresAt).getTime() - LOADED_AT < THIRTY_DAYS
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Icon className="h-4 w-4" />
            {meta.provider}
          </CardTitle>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
            <a href={meta.docs} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              API docs
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{STORE_LABELS[platform]}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <KeyRound className="h-3.5 w-3.5" />
            Authentication
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{meta.auth}</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium">What the official API can do</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {OPERATION_LABELS.map((operation) => {
              const supported = meta.capabilities[operation.key];
              return (
                <li key={operation.key} className="flex items-center gap-1.5 text-xs">
                  {supported ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  ) : (
                    <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                  )}
                  <span className={supported ? "" : "text-muted-foreground"}>{operation.label}</span>
                  {!supported && (
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      manual
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{meta.notes}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Account name</Label>
            <Input value={draft.accountName} onChange={(e) => set({ accountName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Public identifier</Label>
            <Input
              value={draft.publicIdentifier}
              placeholder={platform === "IOS" || platform === "MACOS" ? "Issuer ID / Key ID" : "Tenant / service account"}
              onChange={(e) => set({ publicIdentifier: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Server secret reference</Label>
            <Input
              value={draft.secretRef}
              placeholder="e.g. APP_STORE_CONNECT_P8 (env var name only)"
              onChange={(e) => set({ secretRef: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Credential expires</Label>
            <Input type="date" value={draft.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} />
            {expiringSoon && <p className="text-xs font-medium text-amber-600">Expires within 30 days.</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={draft.notes} className="min-h-16" onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {record.updatedAt ? `Saved ${new Date(record.updatedAt).toLocaleDateString()}` : "Not configured"}
          </span>
          <Button size="sm" onClick={() => onSave(draft)}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
