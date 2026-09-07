import { useMemo, useState } from "react";
import { AlertCircle, Check, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  useCreateTutorAsset,
  useDeleteTutorAsset,
  usePatchTutorAsset,
  useTutorAssets,
  type TutorAsset,
  type TutorAssetCreate,
} from "@/services/tutor-assets-api";

const STATUS_STYLE: Record<TutorAsset["status"], string> = {
  requested: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  processing: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
  disabled: "border-muted-foreground/30 text-muted-foreground",
};

function when(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}

/** A pending institute request: paste the Spatius avatar id to fulfil it. */
function RequestRow({ row, fee }: { row: TutorAsset; fee: number }) {
  const patch = usePatchTutorAsset();
  const del = useDeleteTutorAsset();
  const [avatarId, setAvatarId] = useState("");
  const [charge, setCharge] = useState(true);
  const [reason, setReason] = useState("");
  const busy = patch.isPending || del.isPending;
  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {row.display_name}{" "}
            <span className="text-muted-foreground">· {row.institute_name || row.institute_id}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Requested {when(row.created_at)} · consent {row.consent ? "recorded" : "missing"}
            {row.vendor_job_id ? ` · vendor job ${row.vendor_job_id}` : ""}
          </p>
          {row.notes?.startsWith("http") && (
            <a
              href={row.notes}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
            >
              Open the teacher&apos;s photo <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <Badge variant="outline" className={STATUS_STYLE[row.status]}>
          {row.status}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1 space-y-1">
          <Label className="text-xs">Spatius avatar id (from Studio, after building it from the photo)</Label>
          <Input
            value={avatarId}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            onChange={(e) => setAvatarId(e.target.value)}
            className="h-8 font-mono text-xs"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={charge} onChange={(e) => setCharge(e.target.checked)} />
          Charge {fee} credits
        </label>
        <Button
          size="sm"
          disabled={busy || !avatarId.trim()}
          onClick={() => patch.mutate({ id: row.id, external_id: avatarId.trim(), status: "ready", charge })}
        >
          {patch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Mark ready
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1 space-y-1">
          <Label className="text-xs">Or refuse with a reason the institute sees</Label>
          <Input
            value={reason}
            placeholder="e.g. the photo shows two people / is too small"
            onChange={(e) => setReason(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !reason.trim()}
          onClick={() => patch.mutate({ id: row.id, status: "failed", error: reason.trim() })}
        >
          Refuse
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => del.mutate(row.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {(patch.isError || del.isError) && (
        <p className="mt-2 text-xs text-destructive">
          {String((patch.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || patch.error || del.error)}
        </p>
      )}
    </div>
  );
}

function AssetRow({ row }: { row: TutorAsset }) {
  const patch = usePatchTutorAsset();
  const del = useDeleteTutorAsset();
  const busy = patch.isPending || del.isPending;
  return (
    <tr className="border-t text-sm">
      <td className="px-3 py-2">
        <p className="font-medium">{row.display_name}</p>
        <p className="font-mono text-xs text-muted-foreground">{row.external_id || "—"}</p>
      </td>
      <td className="px-3 py-2 capitalize">{row.kind}</td>
      <td className="px-3 py-2">{row.provider}</td>
      <td className="px-3 py-2">
        {row.stock ? (
          <Badge variant="outline">Stock · all institutes</Badge>
        ) : (
          <span>{row.institute_name || row.institute_id}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <Badge variant="outline" className={STATUS_STYLE[row.status]}>
          {row.status}
        </Badge>
        {row.error && <p className="mt-1 max-w-56 text-xs text-destructive">{row.error}</p>}
      </td>
      <td className="px-3 py-2 tabular-nums">{row.credits_charged ? row.credits_charged : "—"}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{when(row.created_at)}</td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          {row.status === "ready" ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch.mutate({ id: row.id, status: "disabled" })}>
              Disable
            </Button>
          ) : row.status === "disabled" ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch.mutate({ id: row.id, status: "ready" })}>
              Enable
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => del.mutate(row.id)} title="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

const EMPTY: TutorAssetCreate = {
  kind: "avatar",
  provider: "spatius",
  external_id: "",
  display_name: "",
  institute_id: "",
  gender: "",
  languages: ["en", "hi"],
  preview_url: "",
};

function AddAssetForm() {
  const create = useCreateTutorAsset();
  const [form, setForm] = useState<TutorAssetCreate>(EMPTY);
  const set = <K extends keyof TutorAssetCreate>(k: K, v: TutorAssetCreate[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    create.mutate(
      {
        ...form,
        institute_id: form.institute_id?.trim() || null,
        gender: form.gender || null,
        preview_url: form.preview_url?.trim() || null,
      },
      { onSuccess: () => setForm(EMPTY) }
    );
  };
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1">
        <Label className="text-xs">Kind</Label>
        <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as TutorAssetCreate["kind"], provider: v === "avatar" ? "spatius" : "smallest" }))}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="avatar">Avatar (Spatius)</SelectItem>
            <SelectItem value="voice">Voice</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Provider</Label>
        <Input value={form.provider} onChange={(e) => set("provider", e.target.value)} className="h-9" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Vendor id (Spatius avatar id / Smallest voice id)</Label>
        <Input value={form.external_id} onChange={(e) => set("external_id", e.target.value)} className="h-9 font-mono text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Display name</Label>
        <Input value={form.display_name} onChange={(e) => set("display_name", e.target.value)} className="h-9" placeholder="Arjun, Meera…" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Institute id (blank = stock for everyone)</Label>
        <Input value={form.institute_id ?? ""} onChange={(e) => set("institute_id", e.target.value)} className="h-9 font-mono text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Gender</Label>
        <Select value={form.gender || "none"} onValueChange={(v) => set("gender", v === "none" ? "" : v)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            <SelectItem value="female">Female</SelectItem>
            <SelectItem value="male">Male</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Preview image URL (optional)</Label>
        <Input value={form.preview_url ?? ""} onChange={(e) => set("preview_url", e.target.value)} className="h-9 text-xs" />
      </div>
      <div className="flex items-end">
        <Button size="sm" disabled={create.isPending || !form.external_id.trim() || !form.display_name.trim()} onClick={submit}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Register
        </Button>
      </div>
      {create.isError && (
        <p className="text-xs text-destructive md:col-span-2 lg:col-span-4">
          {String((create.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || create.error)}
        </p>
      )}
    </div>
  );
}

export default function TutorAssetsPage() {
  const { data, isLoading, isError, refetch } = useTutorAssets();
  const [tab, setTab] = useState<"all" | "avatar" | "voice" | "stock">("all");
  const [search, setSearch] = useState("");

  const requests = useMemo(
    () => (data?.assets ?? []).filter((a) => a.status === "requested" || a.status === "processing"),
    [data]
  );
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.assets ?? [])
      .filter((a) => a.status !== "requested" && a.status !== "processing")
      .filter((a) => (tab === "all" ? true : tab === "stock" ? a.stock : a.kind === tab))
      .filter((a) =>
        !q
          ? true
          : [a.display_name, a.external_id, a.institute_name, a.institute_id, a.provider]
              .filter(Boolean)
              .some((s) => String(s).toLowerCase().includes(q))
      );
  }, [data, tab, search]);

  return (
    <div>
      <PageHeader
        title="Tutor voices & avatars"
        description="Who the Live AI Tutor can look and sound like. Stock rows are offered to every institute; institute rows are private to that institute. Avatar requests wait here until you build them in Spatius Studio and paste the avatar id."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
        }
      />

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {isError && (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Could not load the registry.
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-6">
          <Card className={cn(requests.length ? "border-amber-500/40" : "")}>
            <CardHeader>
              <CardTitle>Avatar requests {requests.length ? `(${requests.length})` : ""}</CardTitle>
              <CardDescription>
                Open the photo, build the avatar in Spatius Studio (app.spatius.ai → Avatars), then paste the
                avatar id. Marking it ready charges the institute {data.one_time_credits.avatar} credits once.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {requests.length === 0 && <p className="text-sm text-muted-foreground">No pending requests.</p>}
              {requests.map((r) => (
                <RequestRow key={r.id} row={r} fee={data.one_time_credits.avatar} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Register a stock or institute asset</CardTitle>
              <CardDescription>
                Stock avatars: pick public avatars at app.spatius.ai/avatars/library and paste their ids. Voices:
                a Smallest voice id. Give an institute id to make it private to that institute.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <AddAssetForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Registry</CardTitle>
                  <CardDescription>
                    One-time fees: voice clone {data.one_time_credits.voice} credits, custom avatar {data.one_time_credits.avatar} credits (edit in AI Settings → pricing).
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                    <TabsList>
                      <TabsTrigger value="all">All</TabsTrigger>
                      <TabsTrigger value="avatar">Avatars</TabsTrigger>
                      <TabsTrigger value="voice">Voices</TabsTrigger>
                      <TabsTrigger value="stock">Stock</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-9 w-48" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              <table className="w-full min-w-[760px] text-left">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Asset</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">Provider</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Charged</th>
                    <th className="px-3 py-2">Added</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <AssetRow key={r.id} row={r} />
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        Nothing registered yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
