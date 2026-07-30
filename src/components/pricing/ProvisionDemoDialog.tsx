import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Copy, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  defaultExpiry,
  markQuoteProvisioned,
  provisionDemo,
  suggestPassword,
  suggestUsername,
  type DemoProvisionResponse,
  type SavedQuote,
} from "@/services/pricing-api";

/**
 * Turns a quote into a live, time-boxed demo workspace. Only the essentials are asked for —
 * branding, domains and theme belong to the real onboarding after payment.
 */
export function ProvisionDemoDialog({
  quote,
  open,
  onOpenChange,
  onProvisioned,
}: {
  quote: SavedQuote;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProvisioned?: () => void;
}) {
  const [form, setForm] = useState(() => ({
    instituteName: quote.organizationName ?? "",
    adminFullName: quote.contactName ?? "",
    adminEmail: quote.contactEmail ?? "",
    adminPhone: quote.contactPhone ?? "",
    adminUsername: suggestUsername(quote.organizationName, quote.contactName),
    adminPassword: suggestPassword(),
    expiresAt: defaultExpiry(),
  }));
  const [done, setDone] = useState<DemoProvisionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const provision = useMutation({
    mutationFn: async () => {
      const created = await provisionDemo({ ...form, quoteId: quote.id });
      // Link it back to the quote. Best-effort — the workspace exists either way, and
      // failing here must not look like the provisioning failed.
      try {
        await markQuoteProvisioned(quote.id, created.instituteId, created.expiresAt);
        onProvisioned?.();
      } catch {
        /* the workspace is live; the row just won't show it until refresh */
      }
      return created;
    },
    onSuccess: setDone,
    onError: (e: unknown) => {
      const message =
        (e as { response?: { data?: { message?: string; ex?: string } } })?.response?.data?.message ??
        (e as { response?: { data?: { ex?: string } } })?.response?.data?.ex ??
        (e instanceof Error ? e.message : "Couldn't create the demo account.");
      setError(message);
    },
  });

  const submit = () => {
    setError(null);
    if (!form.instituteName.trim()) return setError("Institute name is required.");
    if (!form.adminFullName.trim()) return setError("Admin name is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.adminEmail)) return setError("Enter a valid email.");
    if (!/^[a-zA-Z0-9._-]{3,}$/.test(form.adminUsername))
      return setError("Username: at least 3 characters, letters/numbers/._- only.");
    if (form.adminPassword.length < 6) return setError("Password must be at least 6 characters.");
    provision.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Demo workspace created
              </DialogTitle>
              <DialogDescription>
                {done.instituteName} is live until{" "}
                {new Date(done.expiresAt).toLocaleDateString()}. The welcome email has gone to{" "}
                {form.adminEmail}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <CopyRow label="Portal" value={done.adminPortalUrl} />
              <CopyRow label="Username" value={done.adminUsername} />
              <CopyRow label="Password" value={form.adminPassword} />
              <p className="pt-1 text-xs text-muted-foreground">
                Access stops automatically at expiry. Nothing is deleted — extend the date to let
                them back in.
              </p>
            </div>
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Done
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                Create demo account
              </DialogTitle>
              <DialogDescription>
                Creates a real workspace for this lead, tagged as a free trial and set to expire.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Institute name" value={form.instituteName} onChange={(v) => set("instituteName", v)} className="sm:col-span-2" />
              <Field label="Admin name" value={form.adminFullName} onChange={(v) => set("adminFullName", v)} />
              <Field label="Admin email" value={form.adminEmail} onChange={(v) => set("adminEmail", v)} />
              <Field label="Username" value={form.adminUsername} onChange={(v) => set("adminUsername", v)} />
              <Field label="Password" value={form.adminPassword} onChange={(v) => set("adminPassword", v)} />
              <Field
                label="Demo ends"
                type="date"
                value={form.expiresAt}
                onChange={(v) => set("expiresAt", v)}
                hint="Defaults to 4 days. They lose access after this date."
                className="sm:col-span-2"
              />
            </div>

            {error && <p className="text-sm font-medium text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={provision.isPending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={provision.isPending}>
                {provision.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Creating…
                  </>
                ) : (
                  "Create workspace"
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
    <div className={`space-y-1 ${className ?? ""}`}>
      <label className="text-xs font-medium">{label}</label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-xs">{value}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
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
