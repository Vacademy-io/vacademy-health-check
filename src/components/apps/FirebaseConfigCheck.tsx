import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileWarning, ShieldQuestion, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { verifyFirebaseConfig, type FirebaseVerification } from "@/lib/firebase-config";
import type { Platform } from "@/types/app-registry";

const FIELD_BY_PLATFORM: Partial<Record<Platform, { fieldId: string; fileName: string; expectedField: string }>> = {
  ANDROID: { fieldId: "google_services_json", fileName: "google-services.json", expectedField: "package_name" },
  IOS: { fieldId: "google_service_info_plist", fileName: "GoogleService-Info.plist", expectedField: "bundle_id" },
};

const VERDICT_STYLE = {
  MATCH: { icon: CheckCircle2, className: "border-green-500/40 bg-green-500/5", tone: "text-green-600" },
  MISMATCH: { icon: AlertTriangle, className: "border-destructive/50 bg-destructive/5", tone: "text-destructive" },
  PLACEHOLDER: { icon: FileWarning, className: "border-amber-500/40 bg-amber-500/5", tone: "text-amber-600" },
  UNPARSEABLE: { icon: ShieldQuestion, className: "border-border bg-muted/30", tone: "text-muted-foreground" },
} as const;

interface Props {
  platform: Platform;
  /** The bundle id / package name this app claims, from the platform config. */
  expected: string;
  currentState: string;
  onVerified: (fieldId: string, state: string, projectId: string) => void;
}

/**
 * Checks a Firebase config file actually belongs to this app, instead of asking someone to promise
 * it does. The whole file is read and matched in the browser — nothing is uploaded, and only the
 * resulting project id is stored.
 */
export function FirebaseConfigCheck({ platform, expected, currentState, onVerified }: Props) {
  const config = FIELD_BY_PLATFORM[platform];
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<FirebaseVerification | null>(null);
  const [busy, setBusy] = useState(false);

  if (!config) return null;

  async function onPick(file: File | undefined) {
    if (!file || !config) return;
    setBusy(true);
    try {
      const verification = verifyFirebaseConfig(file.name, await file.text(), expected);
      setResult(verification);
      // Only a genuine match may tick the checklist row. Everything else leaves it blocking.
      if (verification.verdict === "MATCH") {
        onVerified(config.fieldId, "Client-specific file added", verification.facts?.projectId ?? "");
      } else if (verification.verdict === "PLACEHOLDER") {
        onVerified(config.fieldId, "Placeholder / template file", "");
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const style = result ? VERDICT_STYLE[result.verdict] : null;
  const Icon = style?.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Verify {config.fileName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Drop in the file you're about to ship. It's read in your browser and matched against this app's{" "}
          <code className="rounded bg-muted px-1">{expected || "(bundle id not set)"}</code> — nothing is uploaded.
          A file from another client is still a valid file, so nothing else catches this before users do.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".plist,.json,application/json,text/xml"
          className="hidden"
          onChange={(event) => onPick(event.target.files?.[0])}
        />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Upload className="mr-1 h-4 w-4" />
          Choose {config.fileName}
        </Button>

        {result && style && Icon && (
          <div className={cn("space-y-2 rounded-md border p-3", style.className)}>
            <p className={cn("flex items-start gap-2 text-xs font-medium", style.tone)}>
              <Icon className="mt-px h-4 w-4 shrink-0" />
              <span className="leading-relaxed">{result.message}</span>
            </p>
            {result.facts && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <dt>Project</dt>
                <dd className="font-medium text-foreground">{result.facts.projectId || "—"}</dd>
                <dt>{platform === "IOS" ? "Bundle ID" : "Package"}</dt>
                <dd className="font-medium text-foreground">{result.facts.identifiers.join(", ") || "—"}</dd>
                <dt>App ID</dt>
                <dd className="break-all font-medium text-foreground">{result.facts.appId || "—"}</dd>
                <dt>Sender ID</dt>
                <dd className="font-medium text-foreground">{result.facts.senderId || "—"}</dd>
              </dl>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Checklist currently records: <span className="font-medium">{currentState || "not set"}</span>
        </p>
      </CardContent>
    </Card>
  );
}
