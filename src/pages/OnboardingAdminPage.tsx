import { useMemo, useState } from "react";
import { Copy, Loader2, Plus, Rocket, Trash2, Check } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useLinks,
  useCreateLink,
  useDeleteLink,
  useSubmissions,
  useSubmissionCounts,
  useSubmission,
  useUpdateSubmissionStatus,
  useDemoAccounts,
  useUpdateDemoAccount,
  useRecipients,
  useCreateRecipient,
  useDeleteRecipient,
  useQuestions,
  type DemoAccount,
  type Question,
  type UpsertLinkRequest,
} from "@/services/onboarding-api";

const STATUSES = ["NEW", "VIEWED", "CONTACTED", "WON", "LOST"] as const;
const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800 border-blue-300",
  VIEWED: "bg-slate-100 text-slate-700 border-slate-300",
  CONTACTED: "bg-amber-100 text-amber-800 border-amber-300",
  WON: "bg-green-100 text-green-800 border-green-300",
  LOST: "bg-red-100 text-red-700 border-red-300",
};
const TYPE_STYLE: Record<string, string> = {
  GENERAL: "bg-indigo-100 text-indigo-800 border-indigo-300",
  CUSTOM: "bg-purple-100 text-purple-800 border-purple-300",
  DIRECT_DEMO: "bg-teal-100 text-teal-800 border-teal-300",
};

export default function OnboardingAdminPage() {
  return (
    <div>
      <PageHeader
        title="Onboarding & Demos"
        description="Share onboarding links, review who filled them, and manage the four demo workspaces."
      />
      <Tabs defaultValue="submissions">
        <TabsList>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
          <TabsTrigger value="links">Links</TabsTrigger>
          <TabsTrigger value="demos">Demo accounts</TabsTrigger>
          <TabsTrigger value="recipients">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="submissions" className="mt-4">
          <SubmissionsTab />
        </TabsContent>
        <TabsContent value="links" className="mt-4">
          <LinksTab />
        </TabsContent>
        <TabsContent value="demos" className="mt-4">
          <DemoAccountsTab />
        </TabsContent>
        <TabsContent value="recipients" className="mt-4">
          <RecipientsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ----------------------------------------------------------------- Submissions */

function SubmissionsTab() {
  const [status, setStatus] = useState<string>("ALL");
  const [type, setType] = useState<string>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const counts = useSubmissionCounts();
  const { data, isLoading } = useSubmissions({
    status: status === "ALL" ? undefined : status,
    instituteType: type === "ALL" ? undefined : type,
    size: 50,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["total", ...STATUSES] as const).map((k) => (
          <div key={k} className="rounded-lg border bg-card px-3 py-2 text-sm">
            <span className="text-muted-foreground">{k === "total" ? "Total" : k[0] + k.slice(1).toLowerCase()}: </span>
            <span className="font-semibold">{counts.data?.[k] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            <SelectItem value="SCHOOL">School</SelectItem>
            <SelectItem value="DISTANCE_LEARNING">Distance Learning</SelectItem>
            <SelectItem value="CORPORATE">Corporate</SelectItem>
            <SelectItem value="UNIVERSITY">University</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : !data?.content.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No submissions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Features</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.content.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => setOpenId(s.id)}>
                    <TableCell className="font-medium">{s.organizationName || "—"}</TableCell>
                    <TableCell>
                      <div>{s.contactName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{s.contactEmail}</div>
                    </TableCell>
                    <TableCell>{s.instituteTypeLabel || s.instituteType || "—"}</TableCell>
                    <TableCell>{s.featuresOfInterest?.length ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_STYLE[s.status]}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SubmissionDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function SubmissionDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: s } = useSubmission(id);
  const { data: questions } = useQuestions();
  const updateStatus = useUpdateSubmissionStatus();
  const labelFor = useMemo(() => {
    const m = new Map<string, string>();
    questions?.forEach((q) => m.set(q.key, q.label));
    return m;
  }, [questions]);

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {!s ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{s.organizationName || s.contactName || "Submission"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {STATUSES.map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={s.status === st ? "default" : "outline"}
                    disabled={updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ id: s.id, status: st })}
                  >
                    {st}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Contact" value={s.contactName} />
                <Field label="Email" value={s.contactEmail} />
                <Field label="Phone" value={s.contactPhone} />
                <Field label="Institute type" value={s.instituteTypeLabel || s.instituteType} />
                <Field label="Link" value={`${s.linkSlug} (${s.linkType})`} />
                <Field label="Routed demo" value={s.demoInstituteId} />
              </div>
              {!!s.featuresOfInterest?.length && (
                <div>
                  <p className="mb-1 text-sm font-medium">Features of interest</p>
                  <div className="flex flex-wrap gap-1">
                    {s.featuresOfInterest.map((f) => (
                      <Badge key={f} variant="secondary">{f}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-2 text-sm font-medium">All answers</p>
                <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
                  {Object.entries(s.answers ?? {}).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="min-w-[40%] font-medium text-muted-foreground">{labelFor.get(k) || k}</span>
                      <span>{Array.isArray(v) ? v.join(", ") : String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------- Links */

function LinksTab() {
  const { data: links, isLoading } = useLinks();
  const del = useDeleteLink();
  const [builderOpen, setBuilderOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setBuilderOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> New link
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : !links?.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No links yet. Create one to share.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Fills</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      {l.name}
                      {!l.active && <Badge variant="outline" className="ml-2">inactive</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={TYPE_STYLE[l.linkType]}>{l.linkType}</Badge>
                    </TableCell>
                    <TableCell><CopyLink url={l.shareUrl} /></TableCell>
                    <TableCell>{l.submissionCount}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => del.mutate(l.id)} disabled={del.isPending}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <LinkBuilderDialog open={builderOpen} onClose={() => setBuilderOpen(false)} />
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
      title={url}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="max-w-[260px] truncate">{url}</span>
    </button>
  );
}

const TYPE_OPTIONS = [
  { value: "SCHOOL", label: "School" },
  { value: "DISTANCE_LEARNING", label: "Distance Learning" },
  { value: "CORPORATE", label: "Corporate" },
  { value: "UNIVERSITY", label: "University" },
];

function LinkBuilderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: questions } = useQuestions();
  const create = useCreateLink();
  const [name, setName] = useState("");
  const [linkType, setLinkType] = useState("GENERAL");
  const [forcedType, setForcedType] = useState("NONE");
  const [heading, setHeading] = useState("");
  const [sub, setSub] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prefill, setPrefill] = useState<Record<string, string>>({});

  const grouped = useMemo(() => groupBySection(questions ?? []), [questions]);

  const reset = () => {
    setName(""); setLinkType("GENERAL"); setForcedType("NONE");
    setHeading(""); setSub(""); setSelected(new Set()); setPrefill({});
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const save = async () => {
    const body: UpsertLinkRequest = {
      name: name || "Untitled link",
      linkType,
      forcedInstituteType: forcedType === "NONE" ? undefined : forcedType,
      introHeading: heading || undefined,
      introSubheading: sub || undefined,
    };
    if (linkType === "CUSTOM") {
      body.visibleQuestionKeys = Array.from(selected);
      const pv: Record<string, string> = {};
      Object.entries(prefill).forEach(([k, v]) => { if (v?.trim()) pv[k] = v.trim(); });
      if (Object.keys(pv).length) body.prefilledValues = pv;
    }
    await create.mutateAsync(body);
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create onboarding link</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Internal name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme School outreach" />
          </div>

          <div className="space-y-1.5">
            <Label>Link type</Label>
            <Select value={linkType} onValueChange={setLinkType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GENERAL">General — ask everything</SelectItem>
                <SelectItem value="CUSTOM">Custom — pick questions & prefill</SelectItem>
                <SelectItem value="DIRECT_DEMO">Direct demo — no questions</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Institute type {linkType === "DIRECT_DEMO" ? "(which demo)" : "(optional — skip the question)"}</Label>
            <Select value={forcedType} onValueChange={setForcedType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Ask the prospect</SelectItem>
                {TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {linkType !== "DIRECT_DEMO" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Intro heading (optional)</Label>
                  <Input value={heading} onChange={(e) => setHeading(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Intro subheading (optional)</Label>
                  <Input value={sub} onChange={(e) => setSub(e.target.value)} />
                </div>
              </div>

              {linkType === "CUSTOM" && (
                <div className="space-y-3">
                  <Label>Questions to ask (and any answers you already know)</Label>
                  {grouped.map((g) => (
                    <div key={g.key} className="rounded-lg border p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                      <div className="space-y-2">
                        {g.questions.map((q) => (
                          <div key={q.key} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selected.has(q.key)}
                              onChange={() => toggle(q.key)}
                              className="h-4 w-4"
                            />
                            <span className="min-w-[45%] text-sm">{q.label}</span>
                            <Input
                              className="h-8 flex-1"
                              placeholder="prefill (optional)"
                              value={prefill[q.key] ?? ""}
                              onChange={(e) => setPrefill((p) => ({ ...p, [q.key]: e.target.value }))}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={save} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Create link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function groupBySection(questions: Question[]) {
  const order: string[] = [];
  const byKey = new Map<string, { key: string; label: string; questions: Question[] }>();
  for (const q of questions) {
    if (!byKey.has(q.section)) {
      byKey.set(q.section, { key: q.section, label: q.sectionLabel, questions: [] });
      order.push(q.section);
    }
    byKey.get(q.section)!.questions.push(q);
  }
  return order.map((k) => byKey.get(k)!);
}

/* -------------------------------------------------------------- Demo accounts */

function DemoAccountsTab() {
  const { data: demos, isLoading } = useDemoAccounts();
  const [edit, setEdit] = useState<DemoAccount | null>(null);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {demos?.map((d) => (
        <Card key={d.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" /> {d.displayName}</span>
              <Badge variant="outline">{d.instituteTypeLabel}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-muted-foreground">Institute ID</p>
            <p className="mb-2 font-mono text-xs">{d.instituteId}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Admin</p>
                <p className="font-mono text-xs">{d.adminUsername} / {d.adminPassword}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Learner</p>
                <p className="font-mono text-xs">{d.learnerUsername} / {d.learnerPassword}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setEdit(d)}>Edit</Button>
          </CardContent>
        </Card>
      ))}
      <DemoEditDialog key={edit?.id ?? "none"} account={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function DemoEditDialog({ account, onClose }: { account: DemoAccount | null; onClose: () => void }) {
  const update = useUpdateDemoAccount();
  // `key={account.id}` at the call site remounts this on account change, so
  // initialising state straight from props is safe (no re-seed effect needed).
  const [form, setForm] = useState<DemoAccount | null>(account);
  const [syncName, setSyncName] = useState(true);

  if (!account || !form) return null;
  const f = form;
  const setF = (patch: Partial<DemoAccount>) => setForm({ ...f, ...patch });

  const save = async () => {
    await update.mutateAsync({
      id: account.id,
      body: {
        displayName: f.displayName,
        adminUsername: f.adminUsername,
        adminPassword: f.adminPassword,
        learnerUsername: f.learnerUsername,
        learnerPassword: f.learnerPassword,
        adminPortalUrl: f.adminPortalUrl,
        learnerPortalUrl: f.learnerPortalUrl,
        active: f.active,
        syncNameToInstitute: syncName,
      },
    });
    onClose();
  };

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Edit {account.instituteTypeLabel} demo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <LabeledInput label="Display name" value={f.displayName} onChange={(v) => setF({ displayName: v })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={syncName} onChange={(e) => setSyncName(e.target.checked)} className="h-4 w-4" />
            Also rename the live institute (so the prospect sees this name)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput label="Admin username" value={f.adminUsername} onChange={(v) => setF({ adminUsername: v })} />
            <LabeledInput label="Admin password" value={f.adminPassword} onChange={(v) => setF({ adminPassword: v })} />
            <LabeledInput label="Learner username" value={f.learnerUsername} onChange={(v) => setF({ learnerUsername: v })} />
            <LabeledInput label="Learner password" value={f.learnerPassword} onChange={(v) => setF({ learnerPassword: v })} />
          </div>
          <LabeledInput label="Admin portal URL (blank = default)" value={f.adminPortalUrl} onChange={(v) => setF({ adminPortalUrl: v })} />
          <LabeledInput label="Learner portal URL (blank = default)" value={f.learnerPortalUrl} onChange={(v) => setF({ learnerPortalUrl: v })} />
          {update.isError && <p className="text-sm text-red-600">{(update.error as Error)?.message}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ---------------------------------------------------------------- Recipients */

function RecipientsTab() {
  const { data: recipients, isLoading } = useRecipients();
  const create = useCreateRecipient();
  const del = useDeleteRecipient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const add = async () => {
    if (!email.trim()) return;
    await create.mutateAsync({ email: email.trim(), name: name.trim() || undefined });
    setEmail(""); setName("");
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Who gets emailed on a new submission</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ops@vacademy.io" className="w-64" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="w-48" />
          </div>
          <Button onClick={add} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Add
          </Button>
        </div>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <div className="divide-y rounded-lg border">
            {recipients?.length ? recipients.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{r.email}</span>
                  {r.name && <span className="ml-2 text-muted-foreground">{r.name}</span>}
                  {!r.active && <Badge variant="outline" className="ml-2">inactive</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => del.mutate(r.id)} disabled={del.isPending}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            )) : <p className="p-4 text-center text-sm text-muted-foreground">No recipients yet.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
