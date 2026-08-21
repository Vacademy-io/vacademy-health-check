import { Check, ShieldCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SECURITY_CHECKLIST } from "@/lib/platform-requirements";
import type { AppRecord, PrivacyProfile } from "@/types/app-registry";

const PRIVACY_FIELDS: Array<{ key: keyof PrivacyProfile; label: string; multiline?: boolean; help?: string }> = [
  { key: "privacyPolicyUrl", label: "Privacy Policy URL", help: "Must load without a login — reviewers open it in a clean browser." },
  { key: "termsUrl", label: "Terms URL" },
  { key: "dataDeletionUrl", label: "Data Deletion URL", help: "Play links this from the Data Safety form." },
  { key: "accountDeletionUrl", label: "Account Deletion URL", help: "Required by both stores as soon as the app allows sign-up." },
  { key: "dataRetentionPolicy", label: "Data Retention Policy", multiline: true, help: "How long you keep data after an account is deleted, and why." },
  { key: "encryption", label: "Encryption", multiline: true, help: "In transit and at rest — what algorithms, what scope." },
  { key: "authentication", label: "Authentication", multiline: true },
  { key: "thirdPartyServices", label: "Third-party Services", multiline: true, help: "Every SDK that sees user data must appear on both stores' privacy forms." },
  { key: "analytics", label: "Analytics", multiline: true },
  { key: "crashReporting", label: "Crash Reporting", multiline: true },
  { key: "advertisingSdks", label: "Advertising SDKs", multiline: true },
  { key: "paymentSdks", label: "Payment SDKs", multiline: true },
  { key: "loginProviders", label: "Login Providers", multiline: true, help: "Third-party sign-in means Apple requires Sign in with Apple too (4.8)." },
];

/** Privacy & Security (§16): the declarations both stores audit, plus our own security checklist. */
export function PrivacySecurityPanel({
  app,
  onChange,
}: {
  app: AppRecord;
  onChange: (next: AppRecord) => void;
}) {
  function setPrivacy(key: keyof PrivacyProfile, value: string) {
    onChange({ ...app, privacy: { ...app.privacy, [key]: value } });
  }

  function toggleSecurity(id: string) {
    onChange({
      ...app,
      privacy: { ...app.privacy, security: { ...app.privacy.security, [id]: !app.privacy.security[id] } },
    });
  }

  const secured = SECURITY_CHECKLIST.filter((item) => app.privacy.security[item.id]).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Privacy declarations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {PRIVACY_FIELDS.map((field) => (
              <div key={field.key} className={cn("space-y-1.5", field.multiline && "md:col-span-2")}>
                <Label htmlFor={`privacy-${field.key}`} className="text-sm">
                  {field.label}
                </Label>
                {field.multiline ? (
                  <Textarea
                    id={`privacy-${field.key}`}
                    value={String(app.privacy[field.key] ?? "")}
                    onChange={(event) => setPrivacy(field.key, event.target.value)}
                    className="min-h-20"
                  />
                ) : (
                  <Input
                    id={`privacy-${field.key}`}
                    value={String(app.privacy[field.key] ?? "")}
                    onChange={(event) => setPrivacy(field.key, event.target.value)}
                  />
                )}
                {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              {secured === SECURITY_CHECKLIST.length ? (
                <ShieldCheck className="h-4 w-4 text-green-600" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-amber-600" />
              )}
              Security checklist
            </CardTitle>
            <Badge variant={secured === SECURITY_CHECKLIST.length ? "success" : "secondary"}>
              {secured}/{SECURITY_CHECKLIST.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {SECURITY_CHECKLIST.map((item) => {
              const checked = Boolean(app.privacy.security[item.id]);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggleSecurity(item.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        checked ? "border-green-600 bg-green-600 text-white" : "border-input"
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">{item.help}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
