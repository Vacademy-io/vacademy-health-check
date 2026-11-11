import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, ExternalLink, GitPullRequest, Loader2, Rocket, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  buildErrorMessage,
  createFirebaseIosApp,
  getIosBuildStatus,
  startIosBuild,
  type IosBuildRun,
  type IosBuildStatus,
} from "@/services/ios-build";

type Notify = (tone: "success" | "error" | "info", text: string) => void;

/**
 * Builds + uploads the iOS app from the dashboard. Works from any computer (Windows or Mac): the
 * archive runs on a GitHub-hosted macOS runner, started and watched by community_service. The
 * operator needs only this dashboard — no Mac, no Xcode, no GitHub account of their own.
 */
export function IosBuildPanel({ appId, notify }: { appId: string; notify: Notify }) {
  const queryClient = useQueryClient();
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ["ios-build", appId],
    queryFn: () => getIosBuildStatus(appId),
    // Poll while a run is going, and for two minutes after pressing Build (GitHub takes a few
    // seconds to list a freshly dispatched run).
    refetchInterval: (q) => {
      const data = q.state.data as IosBuildStatus | undefined;
      const active = data?.runs.some((r) => r.run.status !== "completed");
      const recent = startedAt !== null && Date.now() - startedAt < 120_000;
      return active || recent ? 10_000 : false;
    },
  });
  const status = query.data;

  const [version, setVersion] = useState("");
  const [buildNumber, setBuildNumber] = useState("");
  useEffect(() => {
    if (!status) return;
    setVersion((v) => v || normaliseVersion(status.currentVersion) || "1.0.0");
    setBuildNumber((b) => b || (status.appStoreConnect.nextBuildNumber ? String(status.appStoreConnect.nextBuildNumber) : ""));
  }, [status]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ios-build", appId] });

  const firebase = useMutation({
    mutationFn: () => createFirebaseIosApp(appId),
    onSuccess: (r) => {
      notify(
        "success",
        r.pending
          ? "Firebase is still creating the iOS app — it will show up here in a minute."
          : r.created
            ? `Firebase iOS app created in ${r.project}.`
            : `This bundle already has a Firebase iOS app in ${r.project}.`
      );
      refresh();
    },
    onError: (e) => notify("error", buildErrorMessage(e)),
  });

  const start = useMutation({
    mutationFn: () => startIosBuild(appId, version.trim(), buildNumber.trim()),
    onSuccess: (r) => {
      setStartedAt(Date.now());
      notify(
        "success",
        r.createsTarget
          ? "Build started. This app has no Xcode target yet, so the build will also open a PR that adds it."
          : "Build started on the macOS runner. It takes about 15–25 minutes."
      );
      refresh();
    },
    onError: (e) => notify("error", buildErrorMessage(e)),
  });

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking Firebase, App Store Connect and GitHub…
        </CardContent>
      </Card>
    );
  }
  if (query.isError || !status) {
    return (
      <Card>
        <CardContent className="space-y-2 py-6 text-sm">
          <p className="text-destructive">Could not load the iOS build status: {buildErrorMessage(query.error)}</p>
          <Button size="sm" variant="outline" onClick={refresh}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const running = status.runs.some((r) => r.run.status !== "completed");
  const targetOnMain = status.repo.targetOnMain === true;
  const asc = status.appStoreConnect;
  const blockers = [
    !status.serverConfig.github && "Server has no GitHub token (APP_BUILD_GITHUB_TOKEN) — builds cannot start.",
    !status.bundleId && "Fill in the iOS Bundle ID on the Registration tab.",
    !status.appHost && "Fill in the iOS App Domain (e.g. student.example.com) on the Registration tab.",
    !targetOnMain && !status.firebase.registered && "New app: create the Firebase iOS app first (button below).",
    !targetOnMain && !status.logoUrl && "New app: upload the 1024×1024 iOS icon in Images & Assets.",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4" /> iOS build
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Builds on a Mac in the cloud and uploads to App Store Connect. Works from any computer.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <Check ok={!!status.bundleId} label="Bundle ID" detail={status.bundleId || "missing"} />
            <Check ok={!!status.appHost} label="App domain" detail={status.appHost || "missing"} />
            <Check
              ok={!!asc.appId}
              label="App Store Connect app"
              detail={
                asc.error ??
                (asc.appId ? `id ${asc.appId}` : asc.configured ? "not created yet — make it once in App Store Connect → New App" : "no ASC credential on the server")
              }
              link={asc.consoleUrl ?? (asc.appId ? undefined : "https://appstoreconnect.apple.com/apps")}
            />
            <Check
              ok={status.firebase.registered === true}
              label={`Firebase iOS app (${status.firebase.project})`}
              detail={
                status.firebase.error ??
                (!status.serverConfig.firebase
                  ? "no Firebase credential on the server"
                  : status.firebase.registered
                    ? status.firebase.appId
                    : "not registered")
              }
              action={
                status.serverConfig.firebase && status.firebase.registered === false ? (
                  <Button size="sm" variant="outline" disabled={firebase.isPending} onClick={() => firebase.mutate()}>
                    {firebase.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    Create Firebase app
                  </Button>
                ) : undefined
              }
            />
            <Check
              ok={targetOnMain}
              pending={!targetOnMain && !status.repo.error}
              label="Xcode target on main"
              detail={
                status.repo.error ??
                (targetOnMain ? status.targetName : `none yet — the first build creates "${status.targetName}" and opens a PR`)
              }
            />
            {status.repo.pr && (
              <Check
                ok={status.repo.pr.merged}
                pending={status.repo.pr.state === "open"}
                label={`Target PR #${status.repo.pr.number}`}
                detail={
                  status.repo.pr.merged
                    ? "merged"
                    : status.repo.pr.state === "open"
                      ? "open — merge it and deploy auth_service before App Review"
                      : "closed without merging"
                }
                link={status.repo.pr.htmlUrl}
                icon={<GitPullRequest className="h-4 w-4" />}
              />
            )}
          </div>

          {blockers.length > 0 && (
            <ul className="list-disc space-y-1 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-6 py-3 text-sm">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="ios-version">Version</Label>
              <Input id="ios-version" className="w-28" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ios-build">Build number</Label>
              <Input id="ios-build" className="w-28" value={buildNumber} onChange={(e) => setBuildNumber(e.target.value)} placeholder="1" />
            </div>
            <Button
              disabled={start.isPending || running || blockers.length > 0 || !version.trim() || !buildNumber.trim()}
              onClick={() => start.mutate()}
            >
              {start.isPending || running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              {running ? "Build running…" : "Build & upload"}
            </Button>
            {asc.nextBuildNumber && (
              <span className="text-xs text-muted-foreground">Next free build number: {asc.nextBuildNumber}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            The upload is not submitted for review automatically — attach it to the version and submit in App Store Connect.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Build runs</CardTitle>
          <a className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline" href={status.workflowUrl} target="_blank" rel="noreferrer">
            All runs on GitHub <ExternalLink className="h-3 w-3" />
          </a>
        </CardHeader>
        <CardContent>
          {status.runsError ? (
            <p className="text-sm text-destructive">{status.runsError}</p>
          ) : status.runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No builds started from the dashboard yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.runs.map((r) => (
                  <RunRow key={r.run.id} row={r} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {asc.builds && asc.builds.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Builds in App Store Connect</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Build</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {asc.builds.map((b) => (
                  <TableRow key={`${b.version}-${b.uploadedDate}`}>
                    <TableCell className="font-mono">{b.version}</TableCell>
                    <TableCell>{formatWhen(b.uploadedDate)}</TableCell>
                    <TableCell className="space-x-1">
                      <Badge variant={b.processingState === "VALID" ? "success" : b.processingState === "PROCESSING" ? "warning" : "destructive"}>
                        {b.processingState}
                      </Badge>
                      {b.expired && (
                        <Badge variant="destructive" title="App Review never picks up a version whose build has expired">
                          expired
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RunRow({ row }: { row: IosBuildRun }) {
  const { run, steps } = row;
  const match = run.title.match(/ (\S+) \((\d+)\) req:/);
  const done = steps?.filter((s) => s.status === "completed").length ?? 0;
  const current = steps?.find((s) => s.status === "in_progress")?.name;
  const failed = steps?.find((s) => s.conclusion === "failure")?.name;
  const tone =
    run.status !== "completed" ? "warning" : run.conclusion === "success" ? "success" : run.conclusion === "cancelled" ? "secondary" : "destructive";
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{formatWhen(run.createdAt)}</TableCell>
      <TableCell className="font-mono">{match ? `${match[1]} (${match[2]})` : "—"}</TableCell>
      <TableCell>
        <Badge variant={tone}>{run.status === "completed" ? run.conclusion || "done" : run.status.replace("_", " ")}</Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {steps ? (
          <span>
            {done}/{steps.length}
            {current && ` · ${current}`}
            {failed && <span className="text-destructive"> · failed at “{failed}”</span>}
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        <a className="inline-flex items-center gap-1 text-xs hover:underline" href={run.htmlUrl} target="_blank" rel="noreferrer">
          Logs <ExternalLink className="h-3 w-3" />
        </a>
      </TableCell>
    </TableRow>
  );
}

function Check({
  ok,
  pending,
  label,
  detail,
  link,
  action,
  icon,
}: {
  ok: boolean;
  pending?: boolean;
  label: string;
  detail?: string | null;
  link?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border px-3 py-2">
      <span className={cn("mt-0.5", ok ? "text-green-600" : pending ? "text-yellow-600" : "text-destructive")}>
        {icon ?? (ok ? <CheckCircle2 className="h-4 w-4" /> : pending ? <CircleDashed className="h-4 w-4" /> : <XCircle className="h-4 w-4" />)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{label}</div>
        {detail && <div className="break-words text-xs text-muted-foreground">{detail}</div>}
      </div>
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="mt-0.5 text-muted-foreground hover:text-foreground" aria-label={`Open ${label}`}>
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
      {action}
    </div>
  );
}

/** "1.0" → "1.0.0" style is fine either way; only strip junk like "v1.2". */
function normaliseVersion(v: string): string {
  const m = v.match(/\d+(\.\d+){0,2}/);
  return m ? m[0] : "";
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
