import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PRODUCTS, suggestPresetKey, trialEndDate, type ProductKey } from "@/lib/command-center";
import { useApplyModulePreset, useModulePresets } from "@/services/institute-modules-api";
import { provisionDemo, suggestPassword, suggestUsername, type DemoProvisionResponse } from "@/services/pricing-api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,}$/;

function apiMessage(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { message?: string; ex?: string } } })?.response?.data;
  return data?.message ?? data?.ex ?? (e instanceof Error ? e.message : fallback);
}

interface Result {
  created: DemoProvisionResponse;
  product: ProductKey;
  password: string;
  email: string;
  /** null = no preset chosen; string = error applying it. */
  presetError: string | null;
  presetName: string | null;
}

/**
 * Command Center › Start a trial. Creates a real workspace through the existing demo provisioning
 * (auth-service): institute + root admin + welcome email, tagged FREE_TRIAL, locked out at expiry.
 * Optionally applies a module preset so the product's features are on from the first login.
 */
export function StartTrialDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const presets = useModulePresets(open);
  const applyPreset = useApplyModulePreset();
  const [product, setProduct] = useState<ProductKey>("vacademy");
  const [presetKey, setPresetKey] = useState<string>("");
  const [presetTouched, setPresetTouched] = useState(false);
  const [form, setForm] = useState(() => ({
    instituteName: "",
    adminFullName: "",
    adminEmail: "",
    adminPhone: "",
    adminUsername: "",
    adminPassword: suggestPassword(),
    expiresAt: trialEndDate(PRODUCTS[0].defaultTrialDays),
  }));
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Result | null>(null);

  const info = PRODUCTS.find((p) => p.key === product)!;
  const presetList = presets.data ?? [];
  // Until the user picks one, follow the product: e.g. a preset named "Telleo calling" for Telleo.
  const effectivePreset = presetTouched ? presetKey : (suggestPresetKey(product, presetList) ?? "");

  const set = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (!usernameTouched && (k === "instituteName" || k === "adminFullName")) {
        next.adminUsername = next.instituteName || next.adminFullName ? suggestUsername(next.instituteName, next.adminFullName) : "";
      }
      return next;
    });

  const pickProduct = (key: ProductKey) => {
    setProduct(key);
    setPresetTouched(false);
    setForm((f) => ({ ...f, expiresAt: trialEndDate(PRODUCTS.find((p) => p.key === key)!.defaultTrialDays) }));
  };

  const reset = () => {
    setDone(null);
    setError(null);
    setUsernameTouched(false);
    setPresetTouched(false);
    setForm({ instituteName: "", adminFullName: "", adminEmail: "", adminPhone: "", adminUsername: "", adminPassword: suggestPassword(), expiresAt: trialEndDate(info.defaultTrialDays) });
  };

  const create = useMutation({
    mutationFn: async (): Promise<Result> => {
      const created = await provisionDemo({
        instituteName: form.instituteName.trim(),
        adminFullName: form.adminFullName.trim(),
        adminEmail: form.adminEmail.trim(),
        adminPhone: form.adminPhone.trim() || undefined,
        adminUsername: form.adminUsername.trim(),
        adminPassword: form.adminPassword,
        expiresAt: form.expiresAt,
      });
      let presetError: string | null = null;
      const preset = presetList.find((p) => p.key === effectivePreset) ?? null;
      if (preset) {
        // The workspace exists either way; a preset failure is reported, not thrown.
        try {
          const r = await applyPreset.mutateAsync({ key: preset.key, instituteIds: [created.instituteId], reason: `${info.label} trial started from Command Center` });
          if (r.failed.length > 0) presetError = r.failed[0].error || "The preset wasn't applied.";
        } catch (e) {
          presetError = apiMessage(e, "The preset wasn't applied.");
        }
      }
      return { created, product, password: form.adminPassword, email: form.adminEmail.trim(), presetError, presetName: preset?.name ?? null };
    },
    onSuccess: (r) => {
      setDone(r);
      qc.invalidateQueries({ queryKey: ["super-admin", "command-center"] });
      qc.invalidateQueries({ queryKey: ["super-admin", "institutes"] });
    },
    onError: (e) => setError(apiMessage(e, "Couldn't create the trial account.")),
  });

  const submit = () => {
    setError(null);
    if (!info.canProvision) return setError(info.blockedReason ?? "This product can't be provisioned yet.");
    if (!form.instituteName.trim()) return setError("Institute name is required.");
    if (!form.adminFullName.trim()) return setError("Admin name is required.");
    if (!EMAIL_RE.test(form.adminEmail.trim())) return setError("Enter a valid email.");
    if (!USERNAME_RE.test(form.adminUsername.trim())) return setError("Username: at least 3 characters, letters, numbers and . _ - only.");
    if (form.adminPassword.length < 6) return setError("Password must be at least 6 characters.");
    if (!form.expiresAt || form.expiresAt < trialEndDate(0)) return setError("Pick an end date from today onwards.");
    create.mutate();
  };

  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                {PRODUCTS.find((p) => p.key === done.product)!.label} trial started
              </DialogTitle>
              <DialogDescription>
                {done.created.instituteName} can sign in until {new Date(done.created.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
                The welcome email has gone to {done.email}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <CopyRow label="Sign in at" value={done.created.adminPortalUrl} />
              <CopyRow label="Username" value={done.created.adminUsername} />
              <CopyRow label="Password" value={done.password} />
              <CopyRow label="Institute ID" value={done.created.instituteId} />
            </div>
            {done.presetName && !done.presetError && <p className="text-xs text-muted-foreground">Module preset "{done.presetName}" applied.</p>}
            {done.presetError && (
              <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" /> The account was created, but the preset "{done.presetName}" failed: {done.presetError}. Apply it from the
                institute's Modules tab.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Access stops automatically at the end date. Nothing is deleted; extending the date lets them back in.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>
                Start another
              </Button>
              <Button className="flex-1" onClick={() => close(false)}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                Start a trial
              </DialogTitle>
              <DialogDescription>Creates a real workspace and admin login, tagged as a free trial. Access stops at the end date.</DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <p className="text-xs font-medium">Product</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Product">
                {PRODUCTS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    role="radio"
                    aria-checked={product === p.key}
                    onClick={() => pickProduct(p.key)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      product === p.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent",
                      !p.canProvision && "opacity-60"
                    )}
                  >
                    <span className="block font-medium">{p.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{p.site}</span>
                  </button>
                ))}
              </div>
              {info.canProvision ? (
                <p className="text-[11px] text-muted-foreground">They sign in at {info.loginUrl.replace("https://", "")}.</p>
              ) : (
                <p className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {info.blockedReason}
                </p>
              )}
            </div>

            <fieldset disabled={!info.canProvision || create.isPending} className="grid gap-3 disabled:opacity-60 sm:grid-cols-2">
              <Field label="Institute / company name" value={form.instituteName} onChange={(v) => set("instituteName", v)} className="sm:col-span-2" />
              <Field label="Admin name" value={form.adminFullName} onChange={(v) => set("adminFullName", v)} />
              <Field label="Admin email" type="email" value={form.adminEmail} onChange={(v) => set("adminEmail", v)} hint="Gets the welcome email." />
              <Field label="Phone (optional)" value={form.adminPhone} onChange={(v) => set("adminPhone", v)} />
              <Field
                label="Username"
                value={form.adminUsername}
                onChange={(v) => {
                  setUsernameTouched(true);
                  set("adminUsername", v);
                }}
              />
              <Field label="Password" value={form.adminPassword} onChange={(v) => set("adminPassword", v)} hint="Shown again after creating, to copy and share." />
              <Field label="Trial ends" type="date" value={form.expiresAt} onChange={(v) => set("expiresAt", v)} hint={`Default ${info.defaultTrialDays} days for ${info.label}.`} />
              <div className="space-y-1 sm:col-span-2">
                <label htmlFor="trial-preset" className="text-xs font-medium">
                  Module preset (optional)
                </label>
                <select
                  id="trial-preset"
                  value={effectivePreset}
                  onChange={(e) => {
                    setPresetTouched(true);
                    setPresetKey(e.target.value);
                  }}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">None: keep the default modules</option>
                  {presetList.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name} ({p.modules.length} modules)
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  {presets.isLoading ? "Loading presets…" : presets.isError ? "Couldn't load presets; you can apply one later." : "Turns on the product's features from the first login. Manage presets under Module Presets."}
                </p>
              </div>
            </fieldset>

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => close(false)} disabled={create.isPending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={create.isPending || !info.canProvision}>
                {create.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Creating…
                  </>
                ) : (
                  `Start ${info.label} trial`
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-xs font-medium">{label}</span>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono text-xs">{value}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Copy ${label}`}
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </span>
    </div>
  );
}
