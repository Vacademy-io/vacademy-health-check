import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, Loader2, Mail, MessageCircle, MessageSquarePlus, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDay, formatInrMinor } from "@/lib/plans";
import {
  durationText,
  emptyRecord,
  endDateFor,
  FOLLOW_UP_LABEL,
  phoneDigits,
  PAYMENT_MODES,
  PAYMENT_STATUSES,
  PM_CLASS_LABEL,
  LOST_REASONS,
  LOST_REASON_LABEL,
  PM_CLASSES,
  recordMonthlyValue,
  SUBSCRIPTION_TYPE_LABEL,
  SUBSCRIPTION_TYPES,
  type PmContact,
  type PmCustomDate,
  type PmPayment,
  type PmRecord,
} from "@/lib/pm-record";
import { PRODUCT_LABELS, productName, TRIAL_STAGE_LABEL, type AccountRow } from "@/lib/pm-view";
import { useCreditsMap, useDeletePmRecord, usePmHistory, useSavePmRecord } from "@/services/pm-api";
import { FollowUpDialog } from "./FollowUpDialog";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "updates", label: "Updates" },
  { key: "contract", label: "Contract & billing" },
  { key: "contacts", label: "Contacts & dates" },
  { key: "history", label: "History" },
] as const;
type DrawerTab = (typeof TABS)[number]["key"];

const selectCls = "h-9 w-full rounded-md border bg-background px-2 text-sm";
const credits = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/** A read-only block of label / value pairs. */
function Facts({ title, rows, action }: { title: string; rows: [string, ReactNode][]; action?: ReactNode }) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
        <p className="text-sm font-semibold">{title}</p>
        {action}
      </div>
      <dl className="divide-y">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 px-4 py-2 text-sm">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface Props {
  account: AccountRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pmConfigured: boolean;
}

/** Account drawer: everything about one institute. Platform facts are read-only; PM data saves to the PM store only. */
export function AccountDrawer({ account, open, onOpenChange, pmConfigured }: Props) {
  const [tab, setTab] = useState<DrawerTab>("overview");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 h-full max-h-screen w-full max-w-3xl translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none p-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:rounded-none">
        {account && <DrawerBody key={`${account.id}:${account.record?.updatedAt ?? ""}`} account={account} pmConfigured={pmConfigured} tab={tab} setTab={setTab} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

const starting = (a: AccountRow): PmRecord =>
  a.record ?? { ...emptyRecord(a.id, a.name), products: a.products, contacts: a.email ? [{ role: "Institute", name: "", email: a.email, phone: "", birthday: "" }] : [] };

function DrawerBody({ account: a, pmConfigured, tab, setTab, onClose }: { account: AccountRow; pmConfigured: boolean; tab: DrawerTab; setTab: (t: DrawerTab) => void; onClose: () => void }) {
  const [r, setR] = useState<PmRecord>(() => starting(a));
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [updating, setUpdating] = useState(false);
  const save = useSavePmRecord();
  const remove = useDeletePmRecord();
  const history = usePmHistory(a.record ? a.id : null);
  const creditsQ = useCreditsMap();
  const creditsError = creditsQ.isError ? (creditsQ.error as { response?: { data?: { detail?: unknown; message?: string } } })?.response?.data?.message ?? (creditsQ.error as Error).message : null;
  const set = <K extends keyof PmRecord>(k: K, v: PmRecord[K]) => setR((cur) => ({ ...cur, [k]: v }));
  const numVal = (v: string) => (v.trim() === "" ? null : Number(v));
  const dirty = JSON.stringify(r) !== JSON.stringify(starting(a));
  const editable = tab === "contract" || tab === "contacts" || tab === "updates";
  const latest = r;

  const onSave = () => {
    setMsg(null);
    save.mutate(
      { ...r, name: a.name },
      {
        onSuccess: () => setMsg({ tone: "ok", text: "Saved. Platform data wasn't changed." }),
        onError: (e) => setMsg({ tone: "err", text: (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? (e as Error).message }),
      }
    );
  };
  const onRemove = () => {
    if (!window.confirm(`Remove ${a.name} from the PM register? This deletes only your notes and contract details; the platform account is untouched.`)) return;
    remove.mutate(a.id, { onSuccess: onClose });
  };
  const updateList = <T,>(key: "contacts" | "payments" | "customDates", i: number, patch: Partial<T>) =>
    setR((cur) => ({ ...cur, [key]: (cur[key] as unknown as T[]).map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const removeAt = (key: "contacts" | "payments" | "customDates" | "followUps", i: number) => setR((cur) => ({ ...cur, [key]: (cur[key] as unknown[]).filter((_, j) => j !== i) }));
  const toggleProduct = (p: string) => set("products", r.products.includes(p) ? r.products.filter((x) => x !== p) : [...r.products, p]);
  const monthly = recordMonthlyValue(r);
  const t = a.trial;

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b px-6 pb-3 pr-12 pt-6">
        <DialogTitle className="text-xl">{a.name}</DialogTitle>
        <DialogDescription className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {a.products.length ? a.products.map((p) => <Badge key={p} className="text-[11px]">{productName(p)}</Badge>) : <Badge variant="outline">Product not set</Badge>}
          <Badge variant="outline">Platform: {({ PROD: "PROD tag", FREE_TRIAL: "Free trial", LEAD: "Lead", TEST: "Test" } as Record<string, string>)[a.platformTag ?? ""] ?? "No tag"}</Badge>
          <Badge variant={a.pmClass ? "secondary" : "outline"}>My label: {a.pmClass ? PM_CLASS_LABEL[a.pmClass] : "none"}</Badge>
          {a.trialStage && <Badge variant="outline">{TRIAL_STAGE_LABEL[a.trialStage]}</Badge>}
          <span className="text-muted-foreground">Health {a.health}/100</span>
          <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => setTab("contract")}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit details
          </Button>
        </DialogDescription>
        <div className="mt-3 flex flex-wrap gap-1">
          {TABS.map((x) => (
            <button key={x.key} type="button" onClick={() => setTab(x.key)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === x.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
              {x.label}
              {x.key === "updates" && latest.followUps.length > 0 && <span className="ml-1 opacity-70">{latest.followUps.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-4 p-6">
        {a.mismatches.length > 0 && (
          <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Your label and the platform disagree (just a heads-up; nothing is changed):</p>
              <ul className="list-disc pl-4">{a.mismatches.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          </div>
        )}
        {!pmConfigured && editable && <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">The PM store isn't connected, so changes can't be saved yet.</p>}

        {tab === "overview" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border md:col-span-2">
              <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
                <p className="text-sm font-semibold">Contacts</p>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setTab("contacts")}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Add / edit contacts
                </Button>
              </div>
              {r.contacts.length === 0 && !a.email ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">No contact yet. Add one under Contacts & dates.</p>
              ) : (
                <ul className="divide-y">
                  {(r.contacts.length ? r.contacts : [{ role: "Institute", name: "", email: a.email, phone: "", birthday: "" }]).map((c, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                      <div className="min-w-[12rem] flex-1">
                        <p className="font-medium">{c.name || c.email || c.phone}{c.role && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{c.role}</span>}</p>
                        <p className="text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
                      </div>
                      <div className="flex gap-1">
                        {c.email && (
                          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                            <a href={`mailto:${c.email}`}><Mail className="mr-1 h-3.5 w-3.5" /> Email</a>
                          </Button>
                        )}
                        {c.phone && (
                          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                            <a href={`tel:+${phoneDigits(c.phone)}`}><Phone className="mr-1 h-3.5 w-3.5" /> Call</a>
                          </Button>
                        )}
                        {c.phone && (
                          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                            <a href={`https://wa.me/${phoneDigits(c.phone)}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp</a>
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Facts
              title="Institute"
              rows={[
                ["Registered", formatDay(a.createdAt)],
                ["Type", a.instituteType || "—"],
                ["Email", a.email || "—"],
                ["Subdomain", a.subdomain || "—"],
                ["Location", [a.city, a.state].filter(Boolean).join(", ") || "—"],
              ]}
              action={
                <Link to={`/institutes/${a.id}`} onClick={onClose} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  Open in Institutes <ExternalLink className="h-3 w-3" />
                </Link>
              }
            />
            <Facts
              title="Product & plan"
              rows={[
                ["Product", a.products.length ? `${a.products.map(productName).join(", ")}${a.productSource === "quote" ? " (from demo quote)" : a.productSource === "platform" ? " (signed up through it)" : ""}` : "Not set: add it under Contract & billing"],
                ["Platform plan", a.platformPlan ?? "None"],
                ["Subscription", a.subscription ? `${a.subscription.status.toLowerCase()}${a.subscription.current_period?.payment_status ? ` · ${a.subscription.current_period.payment_status.toLowerCase()}` : ""}` : "None"],
                ["Platform MRR", a.platformMrrMinor ? formatInrMinor(a.platformMrrMinor) : "—"],
                ["Register plan", latest.planName ? `${latest.planName}${latest.subscriptionType ? ` · ${SUBSCRIPTION_TYPE_LABEL[latest.subscriptionType]}` : ""}` : "—"],
                ["Start → end", latest.startDate || latest.endDate ? `${latest.startDate ? formatDay(latest.startDate) : "?"} → ${latest.endDate ? formatDay(latest.endDate) : "?"}${durationText(latest.startDate, latest.endDate) ? ` (${durationText(latest.startDate, latest.endDate)})` : ""}` : "—"],
                ["Renewal / expiry", latest.renewalDate ? formatDay(latest.renewalDate) : latest.endDate ? formatDay(latest.endDate) : "—"],
                ["Register price", latest.finalPrice != null ? `₹${latest.finalPrice.toLocaleString("en-IN")}${monthly != null ? ` (₹${monthly.toLocaleString("en-IN")}/mo)` : ""}` : "—"],
              ]}
              action={
                <Link to="/ai-subscriptions" onClick={onClose} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  Subscriptions <ExternalLink className="h-3 w-3" />
                </Link>
              }
            />
            <Facts
              title="Trial"
              rows={
                t
                  ? [
                      ["Started", formatDay(t.startedAt ?? a.createdAt)],
                      ["Ends", t.endsAt ? formatDay(t.endsAt) : "No end date"],
                      ["Days left", t.daysLeft === null ? "—" : t.daysLeft < 0 ? `Ended ${-t.daysLeft}d ago` : String(t.daysLeft)],
                      ["Login sent", a.credentialsSentAt ? formatDay(a.credentialsSentAt) : "Tagged trial (no demo login)"],
                      ["Contact", t.contact || "—"],
                    ]
                  : [["Trial", a.paid ? "Paying customer" : "Not on a trial"]]
              }
            />
            <Facts
              title="Usage"
              rows={[
                ["Users logged in", a.usage ? `${a.usage.loggedIn} of ${a.usage.users}` : "Only checked for trial accounts"],
                ["Last login", a.usage?.lastLogin ? formatDay(a.usage.lastLogin) : a.usage ? "Never" : "—"],
                ["Courses", String(a.courses)],
                ["Students", String(a.students)],
                ["AI calls (30 days)", a.calls30 ? `${a.calls30.calls.toLocaleString("en-IN")} calls · ${Math.round(a.calls30.minutes).toLocaleString("en-IN")} min${a.calls30.lastCall ? ` · last ${formatDay(a.calls30.lastCall)}` : ""}` : "—"],
              ]}
            />
            <Facts
              title="AI credits"
              rows={
                a.credits
                  ? [
                      ["Total granted", credits(a.credits.total)],
                      ["Used", credits(a.credits.used)],
                      ["Balance", <span key="b" className={cn(a.credits.low && "text-amber-600")}>{credits(a.credits.balance)}{a.credits.low ? " (low)" : ""}</span>],
                    ]
                  : [["AI credits", creditsQ.isLoading ? "Loading…" : creditsError ? `Couldn't load AI credits: ${creditsError}` : "No credit account for this institute"]]
              }
            />
            <Facts
              title="Your latest update"
              rows={
                latest.followUps[0]
                  ? [
                      ["When", formatDay(latest.followUps[0].date)],
                      ["How it's going", FOLLOW_UP_LABEL[latest.followUps[0].outcome]],
                      ["Note", latest.followUps[0].note || "—"],
                      ["Next check-in", latest.nextFollowUp ? formatDay(latest.nextFollowUp) : "—"],
                    ]
                  : [["Update", "None yet"]]
              }
              action={
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!pmConfigured || dirty} title={dirty ? "Save your changes first" : undefined} onClick={() => setUpdating(true)}>
                  <MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> Add update
                </Button>
              }
            />
          </div>
        )}

        {tab === "updates" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Your check-ins with this account, newest first.</p>
              <Button size="sm" disabled={!pmConfigured || dirty} title={dirty ? "Save your changes first" : undefined} onClick={() => setUpdating(true)}>
                <MessageSquarePlus className="mr-1.5 h-4 w-4" /> Add update
              </Button>
            </div>
            {latest.followUps.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No updates yet.</p>
            ) : (
              <ul className="space-y-2">
                {latest.followUps.map((f, i) => (
                  <li key={i} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span>
                        <span className="font-semibold">{FOLLOW_UP_LABEL[f.outcome]}</span> <span className="text-muted-foreground">· {formatDay(f.date)}</span>
                      </span>
                      <button type="button" className="text-muted-foreground hover:text-destructive" aria-label="Remove update" onClick={() => removeAt("followUps", i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {f.note && <p className="mt-1 text-sm">{f.note}</p>}
                  </li>
                ))}
              </ul>
            )}
            <Field label="Next check-in" className="max-w-xs">
              <Input type="date" value={r.nextFollowUp} onChange={(e) => set("nextFollowUp", e.target.value)} />
            </Field>
          </div>
        )}

        {tab === "contract" && (
          <div className="space-y-4">
            <Group title="My label & product (only for you)">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="My label (only for you)">
                  <select className={selectCls} value={r.classification ?? ""} onChange={(e) => set("classification", (e.target.value || null) as PmRecord["classification"])}>
                    <option value="">No label</option>
                    {PM_CLASSES.map((c) => <option key={c} value={c}>{PM_CLASS_LABEL[c]}</option>)}
                  </select>
                </Field>
                {r.classification === "LOST" && (
                  <Field label="Why did they leave?">
                    <select className={selectCls} value={r.lostReason ?? ""} onChange={(e) => set("lostReason", (e.target.value || null) as PmRecord["lostReason"])}>
                      <option value="">Not recorded</option>
                      {LOST_REASONS.map((c) => <option key={c} value={c}>{LOST_REASON_LABEL[c]}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Owner">
                  <Input value={r.owner} onChange={(e) => set("owner", e.target.value)} placeholder="Who looks after them" />
                </Field>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Products they use</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(PRODUCT_LABELS).map((p) => (
                    <button key={p} type="button" aria-pressed={r.products.includes(p)} onClick={() => toggleProduct(p)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", r.products.includes(p) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
                      {productName(p)}
                    </button>
                  ))}
                </div>
              </div>
            </Group>

            <Group title="Contract">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Plan name"><Input value={r.planName} onChange={(e) => set("planName", e.target.value)} /></Field>
                <Field label="Subscription type">
                  <select className={selectCls} value={r.subscriptionType ?? ""} onChange={(e) => set("subscriptionType", (e.target.value || null) as PmRecord["subscriptionType"])}>
                    <option value="">—</option>
                    {SUBSCRIPTION_TYPES.map((x) => <option key={x} value={x}>{SUBSCRIPTION_TYPE_LABEL[x]}</option>)}
                  </select>
                </Field>
                <Field label="Notice period (days)"><Input type="number" value={r.noticeDays ?? ""} onChange={(e) => set("noticeDays", numVal(e.target.value))} /></Field>
                <Field label="Start date"><Input type="date" value={r.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
                <Field label="End / expiry date"><Input type="date" value={r.endDate} onChange={(e) => set("endDate", e.target.value)} /></Field>
                <Field label="Renewal date"><Input type="date" value={r.renewalDate} onChange={(e) => set("renewalDate", e.target.value)} /></Field>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={r.autoRenew} onChange={(e) => set("autoRenew", e.target.checked)} /> Auto-renews
                </label>
                {durationText(r.startDate, r.endDate) && <span className="text-muted-foreground">Duration: <span className="font-medium text-foreground">{durationText(r.startDate, r.endDate)}</span></span>}
                {endDateFor(r.startDate, r.subscriptionType) && endDateFor(r.startDate, r.subscriptionType) !== r.endDate && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      const end = endDateFor(r.startDate, r.subscriptionType);
                      setR((cur) => ({ ...cur, endDate: end, renewalDate: cur.renewalDate || (() => { const d = new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })() }));
                    }}
                  >
                    Set end date from plan length ({formatDay(endDateFor(r.startDate, r.subscriptionType))})
                  </Button>
                )}
              </div>
            </Group>

            <Group title="Pricing">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="List price (₹)"><Input type="number" value={r.listPrice ?? ""} onChange={(e) => set("listPrice", numVal(e.target.value))} /></Field>
                <Field label="Discount (₹)"><Input type="number" value={r.discount ?? ""} onChange={(e) => set("discount", numVal(e.target.value))} /></Field>
                <Field label="Final price / period (₹)"><Input type="number" value={r.finalPrice ?? ""} onChange={(e) => set("finalPrice", numVal(e.target.value))} /></Field>
                <Field label="GST %"><Input type="number" value={r.gstPercent ?? ""} onChange={(e) => set("gstPercent", numVal(e.target.value))} /></Field>
                <Field label="Payment mode">
                  <select className={selectCls} value={r.paymentMode ?? ""} onChange={(e) => set("paymentMode", (e.target.value || null) as PmRecord["paymentMode"])}>
                    <option value="">—</option>
                    {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ").toLowerCase()}</option>)}
                  </select>
                </Field>
                <Field label="Seats / students"><Input type="number" value={r.seats ?? ""} onChange={(e) => set("seats", numVal(e.target.value))} /></Field>
                <Field label="AI credits included"><Input type="number" value={r.aiCredits ?? ""} onChange={(e) => set("aiCredits", numVal(e.target.value))} /></Field>
                <Field label="Next payment due"><Input type="date" value={r.nextPaymentDue} onChange={(e) => set("nextPaymentDue", e.target.value)} /></Field>
              </div>
              {monthly != null && <p className="text-xs text-muted-foreground">Monthly value: ₹{monthly.toLocaleString("en-IN")}</p>}
            </Group>

            <Group title="Payments received">
              {r.payments.length === 0 && <p className="text-xs text-muted-foreground">No payments recorded.</p>}
              {r.payments.map((p, i) => (
                <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                  <Field label="Date"><Input type="date" value={p.date} onChange={(e) => updateList<PmPayment>("payments", i, { date: e.target.value })} /></Field>
                  <Field label="Amount (₹)"><Input type="number" value={p.amount ?? ""} onChange={(e) => updateList<PmPayment>("payments", i, { amount: numVal(e.target.value) })} /></Field>
                  <Field label="Invoice #"><Input value={p.invoice} onChange={(e) => updateList<PmPayment>("payments", i, { invoice: e.target.value })} /></Field>
                  <Field label="Status">
                    <select className={selectCls} value={p.status} onChange={(e) => updateList<PmPayment>("payments", i, { status: e.target.value as PmPayment["status"] })}>
                      {PAYMENT_STATUSES.map((x) => <option key={x} value={x}>{x.toLowerCase()}</option>)}
                    </select>
                  </Field>
                  <Button variant="ghost" size="icon" onClick={() => removeAt("payments", i)} aria-label="Remove payment"><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set("payments", [...r.payments, { date: "", amount: null, invoice: "", status: "PAID", note: "" }])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add payment
              </Button>
            </Group>
          </div>
        )}

        {tab === "contacts" && (
          <div className="space-y-4">
            <Group title="Contacts">
              {r.contacts.map((c, i) => (
                <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_1.3fr_1fr_1fr_auto]">
                  <Field label="Role"><Input value={c.role} onChange={(e) => updateList<PmContact>("contacts", i, { role: e.target.value })} placeholder="Director" /></Field>
                  <Field label="Name"><Input value={c.name} onChange={(e) => updateList<PmContact>("contacts", i, { name: e.target.value })} /></Field>
                  <Field label="Email"><Input type="email" value={c.email} onChange={(e) => updateList<PmContact>("contacts", i, { email: e.target.value })} /></Field>
                  <Field label="Phone"><Input value={c.phone} onChange={(e) => updateList<PmContact>("contacts", i, { phone: e.target.value })} /></Field>
                  <Field label="Birthday"><Input type="date" value={c.birthday} onChange={(e) => updateList<PmContact>("contacts", i, { birthday: e.target.value })} /></Field>
                  <Button variant="ghost" size="icon" onClick={() => removeAt("contacts", i)} aria-label="Remove contact"><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set("contacts", [...r.contacts, { role: "", name: "", email: "", phone: "", birthday: "" }])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add contact
              </Button>
            </Group>
            <Group title="Key dates">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Signed on"><Input type="date" value={r.signedOn} onChange={(e) => set("signedOn", e.target.value)} /></Field>
                <Field label="Go-live"><Input type="date" value={r.goLiveDate} onChange={(e) => set("goLiveDate", e.target.value)} /></Field>
                <Field label="First payment"><Input type="date" value={r.firstPaymentDate} onChange={(e) => set("firstPaymentDate", e.target.value)} /></Field>
                <Field label="Anniversary (optional)"><Input type="date" value={r.anniversaryDate} onChange={(e) => set("anniversaryDate", e.target.value)} /></Field>
              </div>
              <p className="text-[11px] text-muted-foreground">Anniversary defaults to the go-live date, else the contract start date.</p>
              {r.customDates.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-2">
                  <Field label="Label"><Input value={c.label} onChange={(e) => updateList<PmCustomDate>("customDates", i, { label: e.target.value })} placeholder="Academic year starts" /></Field>
                  <Field label="Date"><Input type="date" value={c.date} onChange={(e) => updateList<PmCustomDate>("customDates", i, { date: e.target.value })} /></Field>
                  <label className="flex h-9 items-center gap-1 text-xs"><input type="checkbox" checked={c.yearly} onChange={(e) => updateList<PmCustomDate>("customDates", i, { yearly: e.target.checked })} /> Yearly</label>
                  <Button variant="ghost" size="icon" onClick={() => removeAt("customDates", i)} aria-label="Remove date"><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set("customDates", [...r.customDates, { label: "", date: "", yearly: true }])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add custom date
              </Button>
            </Group>
            <Group title="Notes & context">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Lead source"><Input value={r.source} onChange={(e) => set("source", e.target.value)} placeholder="google / organic, LinkedIn, event…" /></Field>
                <Field label="Referred by"><Input value={r.referredBy} onChange={(e) => set("referredBy", e.target.value)} /></Field>
              </div>
              <Field label="Notes"><Textarea rows={4} value={r.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
              <Field label="Attachment links (one per line: agreement, PO, invoices)">
                <Textarea rows={2} value={r.attachments.join("\n")} onChange={(e) => set("attachments", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} placeholder="https://drive.google.com/…" />
              </Field>
            </Group>
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-2">
            {!a.record ? (
              <p className="text-sm text-muted-foreground">Nothing saved for this account yet.</p>
            ) : history.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (history.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No changes recorded.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {(history.data ?? []).slice(0, 100).map((h, i) => (
                  <li key={i} className="rounded border px-3 py-2">
                    <p className="text-xs text-muted-foreground">{new Date(h.at).toLocaleString("en-IN")} · {h.by}</p>
                    <p>{h.changes.map((c) => (c.field === "created" ? "Added to register" : c.field === "deleted" ? "Removed from register" : c.field.replace(/([A-Z])/g, " $1").toLowerCase())).join(", ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {(editable || dirty) && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background px-6 py-3">
          <Button onClick={onSave} disabled={!pmConfigured || save.isPending || !dirty}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} {dirty ? "Save changes" : "No changes"}
          </Button>
          {a.record && (
            <Button variant="ghost" className="text-muted-foreground" onClick={onRemove} disabled={!pmConfigured || remove.isPending}>
              Remove from register
            </Button>
          )}
          {msg && <span className={cn("text-xs", msg.tone === "ok" ? "text-emerald-600" : "text-destructive")}>{msg.text}</span>}
          {a.record?.updatedAt && <span className="ml-auto text-[11px] text-muted-foreground">Last saved {formatDay(a.record.updatedAt)} by {a.record.updatedBy || "—"}</span>}
        </div>
      )}

      <FollowUpDialog account={updating ? a : null} onOpenChange={(o) => !o && setUpdating(false)} pmConfigured={pmConfigured} />
    </div>
  );
}
