import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Cloud,
  ExternalLink,
  FileText,
  Hammer,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { AssetStudio, PlatformTabs } from "@/components/apps/AssetStudio";
import { ChecklistPanel, RegistrationProgressCard } from "@/components/apps/ChecklistPanel";
import { FieldGrid, FieldRenderer } from "@/components/apps/FieldRenderer";
import { IntegrationsPanel } from "@/components/apps/IntegrationsPanel";
import { OtaBuildCheck } from "@/components/apps/OtaBuildCheck";
import { PrivacySecurityPanel } from "@/components/apps/PrivacySecurityPanel";
import { QuestionnaireEngine } from "@/components/apps/QuestionnaireEngine";
import { PLATFORM_ICONS, StatusBadge } from "@/components/apps/StatusBadge";
import { StoreContentPanel } from "@/components/apps/StoreContentPanel";
import { SubmissionHistory, VersionsPanel } from "@/components/apps/VersionsPanel";
import { appProgress, overallStatus, platformProgress } from "@/lib/app-checklist";
import { BASIC_FIELDS, PLATFORM_FIELDS, assetSpecsFor } from "@/lib/platform-requirements";
import { generateStoreContent } from "@/lib/store-content";
import { useApp, useDeleteApp, useSaveApp } from "@/services/app-registry-api";
import { CONSOLE_URLS, providerFor } from "@/services/store-providers";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  STORE_LABELS,
  STORE_STATUSES,
  activePlatforms,
  emptyPlatformConfig,
  type AppBasics,
  type AppRecord,
  type ChecklistOverride,
  type Platform,
  type StoreStatus,
} from "@/types/app-registry";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "registration", label: "Registration" },
  { value: "assets", label: "Images & Assets" },
  { value: "content", label: "Store Content" },
  { value: "privacy", label: "Privacy & Security" },
  { value: "builds", label: "Builds" },
  { value: "versions", label: "Versions" },
  { value: "status", label: "Status" },
  { value: "submission", label: "Submission History" },
] as const;

/**
 * A single app's complete registration dashboard (§22).
 *
 * Edits are held locally and flushed on a short debounce, so typing never blocks on a write and
 * the header can honestly say whether everything is saved.
 */
export default function AppDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const query = useApp(id);
  const save = useSaveApp();
  const remove = useDeleteApp();
  const { toasts, push, dismiss } = useToasts();

  const [draft, setDraft] = useState<AppRecord | null>(null);
  const [dirty, setDirty] = useState(false);
  const [checking, setChecking] = useState<Platform | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tab = params.get("tab") ?? "overview";
  const platformParam = params.get("platform") as Platform | null;

  // Once the user has touched anything, the local draft wins: a background refetch must never
  // stamp on edits that haven't been flushed yet. The id check matters when the route param
  // changes under a mounted page — otherwise the previous app's draft would leak into the new one.
  const record = (draft?.id === id ? draft : null) ?? query.data ?? null;

  const enabled = useMemo(() => (record ? activePlatforms(record) : []), [record]);
  const platform: Platform = platformParam && enabled.includes(platformParam) ? platformParam : enabled[0] ?? "ANDROID";

  const update = useCallback(
    (next: AppRecord) => {
      setDraft(next);
      setDirty(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        save.mutate(next, {
          onSuccess: () => setDirty(false),
          onError: () => push("error", "Could not save. Your changes are still on screen — try again."),
        });
      }, 600);
    },
    [push, save]
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function setTab(value: string) {
    const next = new URLSearchParams(params);
    next.set("tab", value);
    setParams(next, { replace: true });
  }

  function setPlatform(value: Platform) {
    const next = new URLSearchParams(params);
    next.set("platform", value);
    setParams(next, { replace: true });
  }

  if (query.isLoading || !record) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || (!query.isLoading && !query.data)) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">That app no longer exists.</p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link to="/apps">Back to App Registration</Link>
        </Button>
      </div>
    );
  }

  const app = record;
  const progress = appProgress(app);
  const config = app.platforms[platform] ?? emptyPlatformConfig();

  async function checkStatus() {
    setChecking(platform);
    const result = await providerFor(platform).getAppStatus(app.id);
    setChecking(null);
    if (result.ok && result.data) {
      update({
        ...app,
        platforms: {
          ...app.platforms,
          [platform]: {
            ...app.platforms[platform],
            status: result.data.status,
            currentVersion: result.data.version,
            currentBuild: result.data.build,
            releasedAt: result.data.releasedAt,
            lastSyncedAt: new Date().toISOString(),
          },
        },
      });
      push("success", `${PLATFORM_LABELS[platform]} synced from the store.`);
    } else {
      push(result.manual ? "info" : "error", result.message);
    }
  }

  function generateContent() {
    const latest = app.versions
      .filter((v) => v.platform === platform)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    update({
      ...app,
      content: {
        ...app.content,
        [platform]: generateStoreContent({ app, platform, version: latest?.version }),
      },
    });
    setTab("content");
    push("success", "Draft store content generated. Review it before approving.");
  }

  function setBasic(key: keyof AppBasics, value: string) {
    update({ ...app, basics: { ...app.basics, [key]: value } });
  }

  function setPlatformField(fieldId: string, value: string) {
    update({
      ...app,
      platforms: {
        ...app.platforms,
        [platform]: { ...config, fields: { ...config.fields, [fieldId]: value } },
      },
    });
  }

  function setAnswer(questionId: string, value: string | string[]) {
    update({
      ...app,
      platforms: {
        ...app.platforms,
        [platform]: { ...config, answers: { ...config.answers, [questionId]: value } },
      },
    });
  }

  function setOverride(itemId: string, state: ChecklistOverride | null) {
    const overrides = { ...config.checklistOverrides };
    if (state == null) delete overrides[itemId];
    else overrides[itemId] = state;
    update({ ...app, platforms: { ...app.platforms, [platform]: { ...config, checklistOverrides: overrides } } });
  }

  function togglePlatform(target: Platform) {
    const current = app.platforms[target];
    update({
      ...app,
      platforms: {
        ...app.platforms,
        [target]: {
          ...current,
          enabled: !current.enabled,
          status: !current.enabled ? "DRAFT" : "NOT_REGISTERED",
        },
      },
    });
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
        <Link to="/apps">
          <ArrowLeft className="mr-1 h-4 w-4" />
          App Registration
        </Link>
      </Button>

      <PageHeader
        title={app.basics.name || "Untitled app"}
        description={`${app.basics.client || "—"} · ${app.basics.packageName || "no bundle id"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-muted-foreground">
              {dirty || save.isPending ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
            </span>
            <Button size="sm" variant="outline" onClick={() => setTab("registration")}>
              Edit App
            </Button>
            <Button size="sm" variant="outline" disabled={checking != null} onClick={checkStatus}>
              {checking ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
              Check Status
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTab("builds")}>
              <Hammer className="mr-1 h-4 w-4" />
              Check Build
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTab("assets")}>
              <ImageIcon className="mr-1 h-4 w-4" />
              Generate Assets
            </Button>
            <Button size="sm" onClick={generateContent}>
              <Sparkles className="mr-1 h-4 w-4" />
              Generate Store Content
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTab("submission")}>
              <FileText className="mr-1 h-4 w-4" />
              View Submission
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={overallStatus(app)} />
        <span className="text-sm text-muted-foreground">
          {progress.percent}% registered ({progress.done}/{progress.total} required items)
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORMS.map((target) => {
            const Icon = PLATFORM_ICONS[target];
            const on = app.platforms[target].enabled;
            return (
              <button
                key={target}
                type="button"
                onClick={() => togglePlatform(target)}
                title={on ? "Disable this platform" : "Enable this platform"}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                  on ? "border-border bg-secondary" : "border-dashed text-muted-foreground/60 hover:bg-accent"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {PLATFORM_LABELS[target]}
              </button>
            );
          })}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList className="mb-4 w-max">
            {TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {enabled.length > 1 && tab !== "overview" && tab !== "privacy" && tab !== "versions" && tab !== "submission" && (
          <div className="mb-4">
            <PlatformTabs platforms={enabled} value={platform} onChange={setPlatform} />
          </div>
        )}

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Platforms</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {enabled.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No platforms enabled. Toggle one above to start its checklist.
                    </p>
                  )}
                  {enabled.map((target) => {
                    const Icon = PLATFORM_ICONS[target];
                    const targetConfig = app.platforms[target];
                    const targetProgress = platformProgress(app, target);
                    const assetsDone = assetSpecsFor(target)
                      .filter((s) => s.required)
                      .filter((s) => app.assets.some((a) => a.platform === target && a.specId === s.id)).length;
                    const assetsNeeded = assetSpecsFor(target).filter((s) => s.required).length;
                    return (
                      <button
                        key={target}
                        type="button"
                        onClick={() => {
                          setPlatform(target);
                          setTab("status");
                        }}
                        className="rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <Icon className="h-4 w-4" />
                            {PLATFORM_LABELS[target]}
                          </span>
                          <StatusBadge status={targetConfig.status} />
                        </div>
                        <dl className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                          <div className="flex justify-between">
                            <dt>Version</dt>
                            <dd className="font-medium text-foreground">{targetConfig.currentVersion || "—"}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt>Build</dt>
                            <dd className="font-medium text-foreground">{targetConfig.currentBuild || "—"}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt>Released</dt>
                            <dd className="font-medium text-foreground">{targetConfig.releasedAt || "—"}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt>Assets</dt>
                            <dd className="font-medium text-foreground">
                              {assetsDone}/{assetsNeeded}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt>Registration</dt>
                            <dd className="font-medium text-foreground">{targetProgress.percent}%</dd>
                          </div>
                        </dl>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">What to do next</CardTitle>
                </CardHeader>
                <CardContent>
                  {enabled.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Enable a platform to get a task list.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {platformProgress(app, platform)
                        .blocking.slice(0, 8)
                        .map((item) => (
                          <li key={item.id} className="flex items-center gap-2 text-sm">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            <span className="flex-1">{item.label}</span>
                            <span className="text-xs text-muted-foreground">{item.section}</span>
                          </li>
                        ))}
                      {platformProgress(app, platform).blocking.length === 0 && (
                        <li className="flex items-center gap-2 text-sm text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          Everything required for {PLATFORM_LABELS[platform]} is done.
                        </li>
                      )}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              {enabled.length > 0 && (
                <RegistrationProgressCard app={app} platform={platform} onNavigate={setTab} />
              )}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Danger zone</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => {
                      if (!window.confirm(`Delete ${app.basics.name}? This removes the record from the dashboard only — store listings are untouched.`)) return;
                      remove.mutate(app.id, { onSuccess: () => navigate("/apps") });
                    }}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete this app
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="registration" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Basic information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    {BASIC_FIELDS.map((field) => (
                      <FieldRenderer
                        key={field.id}
                        spec={field}
                        value={String(app.basics[field.key] ?? "")}
                        onChange={(value) => setBasic(field.key, value)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>

              {enabled.length > 0 && (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">{STORE_LABELS[platform]} configuration</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FieldGrid
                        specs={PLATFORM_FIELDS[platform]}
                        values={config.fields}
                        onChange={setPlatformField}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <QuestionnaireEngine
                        app={app}
                        platform={platform}
                        onAnswer={setAnswer}
                        onField={setPlatformField}
                      />
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {enabled.length > 0 && (
              <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                <RegistrationProgressCard app={app} platform={platform} onNavigate={setTab} />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="assets">
          <AssetStudio app={app} onChange={update} notify={push} lockPlatform={enabled.length > 0 ? platform : undefined} />
        </TabsContent>

        <TabsContent value="content">
          {enabled.length === 0 ? (
            <EmptyPlatforms />
          ) : (
            <StoreContentPanel app={app} platform={platform} onChange={update} notify={push} />
          )}
        </TabsContent>

        <TabsContent value="privacy">
          <PrivacySecurityPanel app={app} onChange={update} />
        </TabsContent>

        <TabsContent value="builds">
          <OtaBuildCheck apps={[app]} onChange={update} notify={push} />
        </TabsContent>

        <TabsContent value="versions">
          <VersionsPanel app={app} onChange={update} notify={push} />
        </TabsContent>

        <TabsContent value="status" className="space-y-4">
          {enabled.length === 0 ? (
            <EmptyPlatforms />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <ChecklistPanel app={app} platform={platform} onOverride={setOverride} onNavigate={setTab} />
              <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{STORE_LABELS[platform]} status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Store status</Label>
                      <Select
                        value={config.status}
                        onValueChange={(value) =>
                          update({
                            ...app,
                            platforms: { ...app.platforms, [platform]: { ...config, status: value as StoreStatus } },
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STORE_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Current version</Label>
                        <Input
                          value={config.currentVersion}
                          placeholder="2.4.1"
                          onChange={(e) =>
                            update({
                              ...app,
                              platforms: { ...app.platforms, [platform]: { ...config, currentVersion: e.target.value } },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Build</Label>
                        <Input
                          value={config.currentBuild}
                          placeholder="241"
                          onChange={(e) =>
                            update({
                              ...app,
                              platforms: { ...app.platforms, [platform]: { ...config, currentBuild: e.target.value } },
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Released</Label>
                      <Input
                        type="date"
                        value={config.releasedAt}
                        onChange={(e) =>
                          update({
                            ...app,
                            platforms: { ...app.platforms, [platform]: { ...config, releasedAt: e.target.value } },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Store listing URL</Label>
                      <Input
                        value={config.storeUrl}
                        placeholder="https://play.google.com/store/apps/details?id=…"
                        onChange={(e) =>
                          update({
                            ...app,
                            platforms: { ...app.platforms, [platform]: { ...config, storeUrl: e.target.value } },
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground">
                        {config.lastSyncedAt
                          ? `Synced ${new Date(config.lastSyncedAt).toLocaleString()}`
                          : "Never synced from the store"}
                      </span>
                      <Button size="sm" variant="outline" asChild>
                        <a href={config.storeUrl || CONSOLE_URLS[platform]} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1 h-3.5 w-3.5" />
                          Console
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="submission" className="space-y-4">
          <SubmissionHistory app={app} onChange={update} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Cloud className="h-4 w-4" />
                Store integrations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IntegrationsPanel notify={push} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function EmptyPlatforms() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No platforms enabled yet. Turn one on above and its fields, questions and checklist appear here.
        </p>
        <div className="mt-3 flex justify-center gap-1.5">
          {PLATFORMS.map((platform) => (
            <Badge key={platform} variant="outline">
              {PLATFORM_LABELS[platform]}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
