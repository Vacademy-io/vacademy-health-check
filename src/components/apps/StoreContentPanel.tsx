import { useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Globe, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  COPY_LIMITS,
  SHORT_FIELD_NAME,
  fetchWebsiteSummary,
  generateReviewNotes,
  generateStoreContent,
  missingReviewFields,
} from "@/lib/store-content";
import {
  STORE_LABELS,
  emptyStoreContent,
  type AppRecord,
  type Platform,
  type ReviewInfo,
  type StoreContent,
} from "@/types/app-registry";

interface StoreContentPanelProps {
  app: AppRecord;
  platform: Platform;
  onChange: (next: AppRecord) => void;
  notify: (tone: "success" | "error" | "info", text: string) => void;
}

/**
 * Store content generator (§17) and review-notes generator (§18).
 *
 * Generation is a *draft*: it fills the boxes and marks the content unapproved. Nothing leaves
 * this screen until a person has read it and ticked "Reviewed and approved" — that's the whole
 * point of the guard, since bad store copy is expensive to undo once a listing is live.
 */
export function StoreContentPanel({ app, platform, onChange, notify }: StoreContentPanelProps) {
  const content = app.content[platform] ?? emptyStoreContent();
  const limits = COPY_LIMITS[platform];
  const [generating, setGenerating] = useState(false);

  function setContent(patch: Partial<StoreContent>) {
    onChange({ ...app, content: { ...app.content, [platform]: { ...content, ...patch } } });
  }

  async function generate(useWebsite: boolean) {
    setGenerating(true);
    let site = null;
    if (useWebsite) {
      const result = await fetchWebsiteSummary(app.basics.websiteUrl);
      site = result.summary;
      if (result.error) notify("info", result.error);
    }
    const latest = app.versions
      .filter((v) => v.platform === platform)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    const generated = generateStoreContent({ app, platform, site, version: latest?.version });
    onChange({ ...app, content: { ...app.content, [platform]: generated } });
    setGenerating(false);
    notify("success", "Draft generated. Read it through and edit before you approve it.");
  }

  const missing = missingReviewFields(app, platform);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">Store content — {STORE_LABELS[platform]}</CardTitle>
            <div className="flex items-center gap-2">
              {content.generatedAt && (
                <span className="text-xs text-muted-foreground">
                  Drafted {new Date(content.generatedAt).toLocaleString()}
                </span>
              )}
              <Button size="sm" variant="outline" disabled={generating} onClick={() => generate(false)}>
                {generating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                Generate
              </Button>
              <Button size="sm" disabled={generating || !app.basics.websiteUrl} onClick={() => generate(true)}>
                <Globe className="mr-1 h-4 w-4" />
                Generate from website
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!app.basics.websiteUrl && (
            <p className="rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              Add a Website URL on the Registration tab to let the generator pull real copy from the site. Without it
              the draft is written from the app details alone.
            </p>
          )}

          <CopyField
            label={SHORT_FIELD_NAME[platform]}
            limit={limits.short}
            value={content.shortDescription}
            onChange={(value) => setContent({ shortDescription: value, approved: false })}
            onCopy={() => copy(content.shortDescription, notify)}
          />
          <CopyField
            label="Full description"
            limit={limits.full}
            rows={12}
            value={content.fullDescription}
            onChange={(value) => setContent({ fullDescription: value, approved: false })}
            onCopy={() => copy(content.fullDescription, notify)}
          />
          <CopyField
            label="What's New (release notes)"
            limit={limits.whatsNew}
            rows={6}
            value={content.whatsNew}
            onChange={(value) => setContent({ whatsNew: value, approved: false })}
            onCopy={() => copy(content.whatsNew, notify)}
          />
          {(platform === "IOS" || platform === "MACOS") && (
            <CopyField
              label="Keywords"
              limit={100}
              rows={2}
              value={content.keywords}
              onChange={(value) => setContent({ keywords: value, approved: false })}
              onCopy={() => copy(content.keywords, notify)}
            />
          )}

          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-md border p-3",
              content.approved ? "border-green-500/40 bg-green-500/5" : "border-amber-500/40 bg-amber-500/5"
            )}
          >
            <p className="flex items-center gap-2 text-xs">
              {content.approved ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Approved — safe to paste into the store console.
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  This is a generated draft. Read it, edit it, then approve.
                </>
              )}
            </p>
            <Button size="sm" variant={content.approved ? "outline" : "default"} onClick={() => setContent({ approved: !content.approved })}>
              {content.approved ? "Mark as draft" : "Reviewed and approved"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ReviewInfoCard app={app} platform={platform} onChange={onChange} notify={notify} missing={missing} />
    </div>
  );
}

const REVIEW_FIELDS: Array<{ key: keyof ReviewInfo; label: string; multiline?: boolean; help?: string }> = [
  { key: "demoAccount", label: "Demo Account", help: "Which account the reviewer should use, and what it can see." },
  { key: "username", label: "Username" },
  { key: "password", label: "Password", help: "Reviewers need a working password. Use a dedicated review account, never a real learner's." },
  { key: "loginInstructions", label: "Login Instructions", multiline: true },
  { key: "subscriptionInstructions", label: "Subscription Instructions", multiline: true },
  { key: "testPaymentInstructions", label: "Test Payment Instructions", multiline: true },
  { key: "specialFeatures", label: "Special Features", multiline: true },
  { key: "restrictedFeatures", label: "Restricted Features", multiline: true },
  { key: "navigationInstructions", label: "Navigation Instructions", multiline: true },
  { key: "contactInformation", label: "Contact Information" },
];

function ReviewInfoCard({
  app,
  platform,
  onChange,
  notify,
  missing,
}: {
  app: AppRecord;
  platform: Platform;
  onChange: (next: AppRecord) => void;
  notify: (tone: "success" | "error" | "info", text: string) => void;
  missing: Array<keyof ReviewInfo>;
}) {
  const content = app.content[platform] ?? emptyStoreContent();

  function setReview(key: keyof ReviewInfo, value: string) {
    onChange({ ...app, review: { ...app.review, [key]: value } });
  }

  function regenerate() {
    const notes = generateReviewNotes(app, platform);
    onChange({ ...app, content: { ...app.content, [platform]: { ...content, reviewNotes: notes } } });
    notify("success", "Review notes rebuilt from the current answers.");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">Review Information</CardTitle>
          <Button size="sm" variant="outline" onClick={regenerate}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Rebuild review notes
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {missing.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
            <span>
              Missing what the reviewer will need:{" "}
              <strong>{missing.map((key) => REVIEW_FIELDS.find((f) => f.key === key)?.label ?? key).join(", ")}</strong>. A
              reviewer who can't get into the app rejects it — this is the most common rejection we see.
            </span>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {REVIEW_FIELDS.map((field) => (
            <div key={field.key} className={cn("space-y-1.5", field.multiline && "md:col-span-2")}>
              <Label htmlFor={`review-${field.key}`} className="text-sm">
                {field.label}
                {missing.includes(field.key) && <span className="ml-1 text-destructive">*</span>}
              </Label>
              {field.multiline ? (
                <Textarea
                  id={`review-${field.key}`}
                  value={app.review[field.key]}
                  onChange={(event) => setReview(field.key, event.target.value)}
                  className="min-h-20"
                />
              ) : (
                <Input
                  id={`review-${field.key}`}
                  value={app.review[field.key]}
                  onChange={(event) => setReview(field.key, event.target.value)}
                />
              )}
              {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
            </div>
          ))}
        </div>

        <CopyField
          label="Generated review note (paste this into the store)"
          rows={14}
          value={content.reviewNotes}
          onChange={(value) =>
            onChange({ ...app, content: { ...app.content, [platform]: { ...content, reviewNotes: value } } })
          }
          onCopy={() => copy(content.reviewNotes, notify)}
        />
        <CopyField
          label="App access instructions"
          rows={6}
          value={content.accessInstructions}
          onChange={(value) =>
            onChange({ ...app, content: { ...app.content, [platform]: { ...content, accessInstructions: value } } })
          }
          onCopy={() => copy(content.accessInstructions, notify)}
        />
      </CardContent>
    </Card>
  );
}

function CopyField({
  label,
  value,
  limit,
  rows = 3,
  onChange,
  onCopy,
}: {
  label: string;
  value: string;
  limit?: number;
  rows?: number;
  onChange: (value: string) => void;
  onCopy: () => void;
}) {
  const over = limit != null && value.length > limit;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">{label}</Label>
        <div className="flex items-center gap-2">
          {limit != null && (
            <Badge variant={over ? "destructive" : "secondary"} className="text-[10px] tabular-nums">
              {value.length}/{limit}
            </Badge>
          )}
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onCopy} disabled={!value}>
            <Copy className="mr-1 h-3 w-3" />
            Copy
          </Button>
        </div>
      </div>
      <Textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className={cn("font-normal", over && "border-destructive")}
      />
      {over && limit != null && (
        <p className="text-xs font-medium text-destructive">
          {value.length - limit} characters over the store limit — it will be rejected as-is.
        </p>
      )}
    </div>
  );
}

function copy(text: string, notify: (tone: "success" | "error" | "info", message: string) => void) {
  navigator.clipboard
    .writeText(text)
    .then(() => notify("success", "Copied."))
    .catch(() => notify("error", "Clipboard blocked by the browser — select and copy by hand."));
}
