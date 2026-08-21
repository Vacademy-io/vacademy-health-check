import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { FieldGrid, FieldRenderer } from "@/components/apps/FieldRenderer";
import { PLATFORM_ICONS } from "@/components/apps/StatusBadge";
import { BASIC_FIELDS, PLATFORM_FIELDS } from "@/lib/platform-requirements";
import { newApp } from "@/services/app-registry-api";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  STORE_LABELS,
  type AppBasics,
  type AppRecord,
  type Platform,
} from "@/types/app-registry";

const STEPS = ["Basic Information", "Platforms", "Configuration", "Review"] as const;

interface WizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (app: AppRecord) => void;
  saving?: boolean;
}

/**
 * The "+ Register New App" wizard (§2, §3).
 *
 * Every field on every step comes from the catalogue, so the wizard grows a field the same day the
 * store does. Only the required subset blocks progress — the rest can be filled in later from the
 * app's own Registration tab, which is the same renderer.
 */
export function RegisterAppWizard({ open, onOpenChange, onCreate, saving }: WizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<AppRecord>(() => newApp());
  const [showErrors, setShowErrors] = useState(false);

  const selected = useMemo(() => PLATFORMS.filter((p) => draft.platforms[p].enabled), [draft]);

  function reset() {
    setDraft(newApp());
    setStep(0);
    setShowErrors(false);
  }

  function setBasic(key: keyof AppBasics, value: string) {
    setDraft((d) => ({ ...d, basics: { ...d.basics, [key]: value } }));
  }

  function togglePlatform(platform: Platform) {
    setDraft((d) => ({
      ...d,
      platforms: {
        ...d.platforms,
        [platform]: {
          ...d.platforms[platform],
          enabled: !d.platforms[platform].enabled,
          // Opting in moves the platform off "Not Registered" — there is now an intent to ship it.
          status: !d.platforms[platform].enabled ? "DRAFT" : "NOT_REGISTERED",
        },
      },
    }));
  }

  function setPlatformField(platform: Platform, fieldId: string, value: string) {
    setDraft((d) => ({
      ...d,
      platforms: {
        ...d.platforms,
        [platform]: { ...d.platforms[platform], fields: { ...d.platforms[platform].fields, [fieldId]: value } },
      },
    }));
  }

  const basicErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const field of BASIC_FIELDS) {
      if (field.required && !String(draft.basics[field.key] ?? "").trim()) {
        errors[field.id] = "Required before the app can be created.";
      }
    }
    return errors;
  }, [draft.basics]);

  const canAdvance =
    step === 0 ? Object.keys(basicErrors).length === 0 : step === 1 ? selected.length > 0 : true;

  function next() {
    if (!canAdvance) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function submit() {
    const now = new Date().toISOString();
    // Seed each platform's own listing fields from the shared basics — they're the same values in
    // practice, and pre-filling them saves retyping the app name four times.
    const seeded: AppRecord = {
      ...draft,
      createdAt: now,
      updatedAt: now,
      privacy: {
        ...draft.privacy,
        privacyPolicyUrl: draft.basics.privacyPolicyUrl,
        termsUrl: draft.basics.termsUrl,
      },
      platforms: { ...draft.platforms },
    };
    for (const platform of PLATFORMS) {
      if (!seeded.platforms[platform].enabled) continue;
      const fields = { ...seeded.platforms[platform].fields };
      const seed = (id: string, value: string) => {
        if (!fields[id]?.trim() && value.trim()) fields[id] = value;
      };
      seed("app_name", draft.basics.name);
      seed("store_app_name", draft.basics.name);
      seed("package_name", draft.basics.packageName);
      seed("application_id", draft.basics.packageName);
      seed("bundle_id", draft.basics.packageName);
      seed("description", draft.basics.description);
      seed("short_description", draft.basics.shortDescription);
      seed("privacy_policy_url", draft.basics.privacyPolicyUrl);
      seed("privacy_url", draft.basics.privacyPolicyUrl);
      seed("support_url", draft.basics.supportUrl);
      seed("category", draft.basics.category);
      seed("play_category", draft.basics.category);
      seed("primary_category", draft.basics.category);
      seeded.platforms[platform] = { ...seeded.platforms[platform], fields };
    }
    onCreate(seeded);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4" />
            Register New App
          </DialogTitle>
          <DialogDescription>
            Four steps. Only the starred fields block creation — everything else can be filled in later.
          </DialogDescription>
        </DialogHeader>

        <Stepper step={step} />

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {BASIC_FIELDS.map((field) => (
                <FieldRenderer
                  key={field.id}
                  spec={field}
                  value={String(draft.basics[field.key] ?? "")}
                  onChange={(value) => setBasic(field.key, value)}
                  error={showErrors ? basicErrors[field.id] : undefined}
                />
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Pick every store this app will ship to. Each one adds its own configuration, checklist and asset
                requirements — you can add more later.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {PLATFORMS.map((platform) => {
                  const Icon = PLATFORM_ICONS[platform];
                  const on = draft.platforms[platform].enabled;
                  return (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => togglePlatform(platform)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                        on ? "border-primary bg-primary/5" : "hover:bg-accent"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-input"
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Icon className="h-4 w-4" />
                          {PLATFORM_LABELS[platform]}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{STORE_LABELS[platform]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {showErrors && selected.length === 0 && (
                <p className="text-xs font-medium text-destructive">Select at least one platform.</p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {selected.length === 0 && <p className="text-sm text-muted-foreground">No platforms selected.</p>}
              {selected.map((platform) => {
                const Icon = PLATFORM_ICONS[platform];
                return (
                  <div key={platform} className="space-y-3">
                    <div className="flex items-center gap-2 border-b pb-2">
                      <Icon className="h-4 w-4" />
                      <h3 className="text-sm font-semibold">{STORE_LABELS[platform]}</h3>
                    </div>
                    <FieldGrid
                      specs={PLATFORM_FIELDS[platform]}
                      values={draft.platforms[platform].fields}
                      onChange={(id, value) => setPlatformField(platform, id, value)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {step === 3 && <ReviewStep draft={draft} selected={selected} />}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t px-6 py-3 sm:justify-between">
          <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </span>
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={next}>
                Next
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                Create App
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-1 border-b bg-muted/30 px-6 py-3 text-xs">
      {STEPS.map((label, index) => (
        <li key={label} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
              index < step
                ? "bg-primary text-primary-foreground"
                : index === step
                  ? "border-2 border-primary text-primary"
                  : "border border-input text-muted-foreground"
            )}
          >
            {index < step ? <Check className="h-3 w-3" /> : index + 1}
          </span>
          <span className={cn("truncate", index === step ? "font-medium text-foreground" : "text-muted-foreground")}>
            {label}
          </span>
          {index < STEPS.length - 1 && <span className="hidden h-px flex-1 bg-border sm:block" />}
        </li>
      ))}
    </ol>
  );
}

function ReviewStep({ draft, selected }: { draft: AppRecord; selected: Platform[] }) {
  const rows: Array<[string, string]> = [
    ["App Name", draft.basics.name],
    ["Display Name", draft.basics.displayName],
    ["Package / Bundle ID", draft.basics.packageName],
    ["Client", draft.basics.client],
    ["Developer", draft.basics.developerName],
    ["Category", draft.basics.category],
    ["Type", draft.basics.appType.replace(/_/g, " ")],
    ["Support Email", draft.basics.supportEmail],
    ["Privacy Policy", draft.basics.privacyPolicyUrl],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="flex min-w-0 items-baseline justify-between gap-3 border-b py-1.5 last:border-0">
                <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                <dd className="truncate text-right text-sm">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-medium">Platforms</p>
        <div className="flex flex-wrap gap-2">
          {selected.map((platform) => (
            <Badge key={platform} variant="secondary">
              {STORE_LABELS[platform]}
            </Badge>
          ))}
        </div>
      </div>

      <p className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
        Creating the app builds a checklist per platform, seeds the store fields from the details above, and opens the
        app's own dashboard. Nothing is sent to any store — registration on Google Play, App Store Connect and Partner
        Center is always done by a person in those consoles.
      </p>
    </div>
  );
}
