import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Download, Info, Loader2, Mail, Pencil, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/plans";
import { PM_CLASS_LABEL, PM_CLASSES, type PmClass } from "@/lib/pm-record";
import { accountsCsv, filterAccounts, PRODUCT_LABELS, productName, QUICK_FILTERS, registerCsv, type AccountRow, type QuickFilter } from "@/lib/pm-view";
import type { LeadTag } from "@/types/api";
import { useBulkPmRecords, useCreditsMap } from "@/services/pm-api";
import { ImportDialog } from "./ImportDialog";
import { downloadText, usePmData } from "./use-pm-data";

const PAGE = 50;
type SortKey = "created" | "name" | "students" | "online" | "calls" | "creditsUsed" | "creditsLow";

/** The platform's lead tag in plain words. Read-only: set on the Institutes page. */
const PLATFORM_STATUS: Record<LeadTag | "NONE", { label: string; tone: string }> = {
  PROD: { label: "PROD tag", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  FREE_TRIAL: { label: "Free trial", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  LEAD: { label: "Lead", tone: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  TEST: { label: "Test", tone: "bg-muted text-muted-foreground" },
  NONE: { label: "No tag", tone: "bg-muted text-muted-foreground" },
};
/** Unknown tags (anything the platform adds later) are shown as they are instead of breaking the table. */
const statusOf = (a: AccountRow) =>
  PLATFORM_STATUS[(a.platformTag ?? "NONE") as keyof typeof PLATFORM_STATUS] ?? { label: String(a.platformTag).replace(/_/g, " ").toLowerCase(), tone: "bg-muted text-foreground" };
/** Who to email for an account: its contacts from your records, else the institute's own email. */
const emailsOf = (a: AccountRow) => {
  const fromRecord = (a.record?.contacts ?? []).map((c) => c.email).filter(Boolean);
  return fromRecord.length ? fromRecord : a.email ? [a.email] : [];
};
const isTest = (a: AccountRow) => a.platformTag === "TEST" || a.pmClass === "TEST" || a.pmClass === "INTERNAL";

function sortRows(rows: AccountRow[], key: SortKey): AccountRow[] {
  const by: Record<SortKey, (a: AccountRow, b: AccountRow) => number> = {
    created: (a, b) => b.createdAt.localeCompare(a.createdAt),
    name: (a, b) => a.name.localeCompare(b.name),
    students: (a, b) => b.students - a.students,
    online: (a, b) => b.activeNow - a.activeNow || b.createdAt.localeCompare(a.createdAt),
    calls: (a, b) => (b.calls30?.calls ?? 0) - (a.calls30?.calls ?? 0) || b.createdAt.localeCompare(a.createdAt),
    creditsUsed: (a, b) => (b.credits?.used ?? -1) - (a.credits?.used ?? -1),
    // Institutes without a credit account go last.
    creditsLow: (a, b) => (a.credits?.balance ?? Infinity) - (b.credits?.balance ?? Infinity),
  };
  return [...rows].sort(by[key]);
}

const selectCls = "h-9 rounded-md border bg-background px-2 text-sm";

interface Props {
  /** Filters set from a link (e.g. a Today task); shown as removable chips. */
  filters: QuickFilter[];
  onFiltersChange: (f: QuickFilter[]) => void;
  onOpenAccount: (id: string) => void;
}

/**
 * PM View › Accounts: every institute. "My label" is the PM's own note about an account and is
 * saved only in the PM store; the platform status column is read-only and never changes from here.
 */
export function AccountsTab({ filters, onFiltersChange, onOpenAccount }: Props) {
  const data = usePmData();
  const bulk = useBulkPmRecords();
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<string>("");
  const [label, setLabel] = useState<string>("");
  const [product, setProduct] = useState<string>("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [sort, setSort] = useState<SortKey>("created");
  const [pageState, setPageState] = useState<{ view: string; page: number }>({ view: "", page: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [markAs, setMarkAs] = useState<string>("PRODUCTION");
  const [productPick, setProductPick] = useState<string>("vacademy");
  const [importOpen, setImportOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const creditsQ = useCreditsMap();
  const testCount = useMemo(() => data.accounts.filter(isTest).length, [data.accounts]);
  const otherTags = useMemo(() => [...new Set(data.accounts.map((x) => x.platformTag).filter((t): t is NonNullable<typeof t> => !!t && !(t in PLATFORM_STATUS)))].sort(), [data.accounts]);
  const rows = useMemo(() => {
    let list = filterAccounts(data.accounts, filters, search);
    if (!showTest && !filters.includes("test")) list = list.filter((a) => !isTest(a));
    if (platform) list = list.filter((a) => (platform === "NONE" ? a.platformTag === null : a.platformTag === platform));
    if (label) list = list.filter((a) => (label === "NONE" ? a.pmClass === null : a.pmClass === label));
    if (product) list = list.filter((a) => (product === "NONE" ? a.products.length === 0 : a.products.includes(product)));
    if (onlineOnly) list = list.filter((a) => a.activeNow > 0);
    return sortRows(list, sort);
  }, [data.accounts, filters, search, showTest, platform, label, product, onlineOnly, sort]);

  const view = JSON.stringify([filters, search, showTest, platform, label, product, onlineOnly, sort]);
  const page = pageState.view === view ? pageState.page : 0;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const setPage = (p: number) => setPageState({ view, page: Math.max(0, Math.min(p, pages - 1)) });
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.id));
  const selectedRows = data.accounts.filter((a) => selected.has(a.id));
  const anyFilter = !!(search || platform || label || product || onlineOnly || filters.length);

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelected((cur) => {
      const next = new Set(cur);
      shown.forEach((r) => (allShownSelected ? next.delete(r.id) : next.add(r.id)));
      return next;
    });
  const clearAll = () => {
    setSearch("");
    setPlatform("");
    setLabel("");
    setProduct("");
    setOnlineOnly(false);
    onFiltersChange([]);
  };

  const applyLabel = () => {
    const classification = markAs === "CLEAR" ? null : (markAs as PmClass);
    bulk.mutate(
      selectedRows.map((a) => ({ instituteId: a.id, name: a.name, classification })),
      {
        onSuccess: (res) => {
          setMsg(`Label ${classification ? `"${PM_CLASS_LABEL[classification]}"` : "removed"} on ${res.saved} account${res.saved === 1 ? "" : "s"}. This is only for you; nothing changed on the platform.`);
          setSelected(new Set());
        },
        onError: (e) => setMsg((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? (e as Error).message),
      }
    );
  };
  const applyProduct = () =>
    bulk.mutate(
      selectedRows.map((a) => ({ instituteId: a.id, name: a.name, products: [...new Set([...(a.record?.products ?? []), productPick])] })),
      { onSuccess: (res) => setMsg(`${productName(productPick)} set as product on ${res.saved} account${res.saved === 1 ? "" : "s"} (only for you).`) }
    );

  const stamp = data.today;
  const selectedEmails = [...new Set(selectedRows.flatMap(emailsOf))];
  const emailSelected = () => {
    window.location.href = `mailto:?bcc=${selectedEmails.map(encodeURIComponent).join(",")}`;
  };
  const copyEmails = async () => {
    try {
      await navigator.clipboard.writeText(selectedEmails.join(", "));
      setMsg(`${selectedEmails.length} email address${selectedEmails.length === 1 ? "" : "es"} copied.`);
    } catch {
      setMsg("Couldn't copy. Use Export selected instead.");
    }
  };
  const linkFilterLabel = (f: QuickFilter) => QUICK_FILTERS.find((q) => q.key === f)?.label ?? f;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-md border bg-muted/30 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          Every institute on the platform. <span className="font-medium">Platform status</span> is what the platform says (read-only). <span className="font-medium">My label</span> and{" "}
          <span className="font-medium">Product</span> are your own notes: tick accounts and set them below. They're saved only for you and never change the platform.
        </p>
      </div>

      {/* ------------------------------------------------ filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, subdomain…" className="h-9 w-64" />
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={selectCls} aria-label="Platform status">
          <option value="">Platform status: all</option>
          {(["PROD", "FREE_TRIAL", "LEAD", "TEST", "NONE"] as const).map((k) => <option key={k} value={k}>{PLATFORM_STATUS[k].label}</option>)}
          {otherTags.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ").toLowerCase()}</option>)}
        </select>
        <select value={label} onChange={(e) => setLabel(e.target.value)} className={selectCls} aria-label="My label">
          <option value="">My label: all</option>
          <option value="NONE">No label yet</option>
          {PM_CLASSES.map((c) => <option key={c} value={c}>{PM_CLASS_LABEL[c]}</option>)}
        </select>
        <select value={product} onChange={(e) => setProduct(e.target.value)} className={selectCls} aria-label="Product">
          <option value="">Product: all</option>
          <option value="NONE">Not set</option>
          {Object.keys(PRODUCT_LABELS).map((p) => <option key={p} value={p}>{productName(p)}</option>)}
        </select>
        <label className="flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm">
          <input type="checkbox" checked={onlineOnly} onChange={(e) => setOnlineOnly(e.target.checked)} /> Online now
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectCls} aria-label="Sort">
          <option value="created">Newest first</option>
          <option value="name">Name A–Z</option>
          <option value="students">Most students</option>
          <option value="online">Most people online</option>
          <option value="calls">Most AI calls (30 days)</option>
          <option value="creditsUsed">Most AI credits used</option>
          <option value="creditsLow">Lowest AI credits left</option>
        </select>
        {anyFilter && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Clear filters
          </Button>
        )}
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Opened from a task:</span>
          {filters.map((f) => (
            <button key={f} type="button" onClick={() => onFiltersChange(filters.filter((x) => x !== f))} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
              {linkFilterLabel(f)} <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {creditsQ.isError && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          AI credits couldn't be loaded ({(creditsQ.error as Error).message}), so the AI credits column is empty. The Credits page in the sidebar shows them.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          {data.isLoading ? "Loading institutes…" : <><span className="font-medium text-foreground">{rows.length}</span> institute{rows.length === 1 ? "" : "s"}</>}
          {testCount > 0 && (
            <>
              {" · "}
              <button type="button" className="text-primary hover:underline" onClick={() => setShowTest((v) => !v)}>
                {showTest ? `Hide ${testCount} test accounts` : `${testCount} test accounts hidden (show)`}
              </button>
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadText(`accounts-${stamp}.csv`, accountsCsv(rows))}>
            <Download className="mr-1.5 h-4 w-4" /> Export list
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadText(`customer-register-${stamp}.csv`, registerCsv(data.accounts.filter((a) => a.record)))}>
            <Download className="mr-1.5 h-4 w-4" /> Export my records
          </Button>
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" /> Upload CSV
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------ selection bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 text-sm shadow-sm">
          <span className="font-medium">{selected.size} selected</span>
          {rows.length > shown.length && !rows.every((r) => selected.has(r.id)) && (
            <Button variant="link" size="sm" className="h-7 px-1" onClick={() => setSelected(new Set(rows.map((r) => r.id)))}>
              Select all {rows.length}
            </Button>
          )}
          <span className="ml-2 text-muted-foreground">Set my label</span>
          <select value={markAs} onChange={(e) => setMarkAs(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="My label">
            {PM_CLASSES.map((c) => <option key={c} value={c}>{PM_CLASS_LABEL[c]}</option>)}
            <option value="CLEAR">Remove label</option>
          </select>
          <Button size="sm" className="h-8" onClick={applyLabel} disabled={!data.pmConfigured || bulk.isPending}>
            {bulk.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Apply
          </Button>
          <span className="ml-2 text-muted-foreground">Set product</span>
          <select value={productPick} onChange={(e) => setProductPick(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Product">
            {Object.keys(PRODUCT_LABELS).map((p) => <option key={p} value={p}>{productName(p)}</option>)}
          </select>
          <Button size="sm" variant="outline" className="h-8" onClick={applyProduct} disabled={!data.pmConfigured || bulk.isPending}>
            Apply
          </Button>
          <Button size="sm" variant="outline" className="ml-auto h-8" onClick={emailSelected} disabled={!selectedEmails.length} title={selectedEmails.length > 50 ? "Long lists may not fit in a mail link; use Copy emails" : undefined}>
            <Mail className="mr-1 h-3.5 w-3.5" /> Email selected ({selectedEmails.length})
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={copyEmails} disabled={!selectedEmails.length}>
            <Copy className="mr-1 h-3.5 w-3.5" /> Copy emails
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => downloadText(`accounts-selected-${stamp}.csv`, accountsCsv(selectedRows))}>
            Export selected
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set())}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      )}
      {msg && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          {msg}{" "}
          <button type="button" className="underline" onClick={() => setMsg(null)}>
            dismiss
          </button>
        </p>
      )}

      {/* ------------------------------------------------ table */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          {data.isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="w-10 px-3 py-2">
                    <input type="checkbox" checked={allShownSelected} onChange={togglePage} aria-label="Select page" />
                  </th>
                  <th className="px-2 py-2 text-left font-medium">Institute</th>
                  <th className="px-2 py-2 text-left font-medium">Platform status</th>
                  <th className="px-2 py-2 text-left font-medium">My label</th>
                  <th className="px-2 py-2 text-left font-medium">Product</th>
                  <th className="px-2 py-2 text-left font-medium">Trial / plan</th>
                  <th className="px-2 py-2 text-right font-medium">Online now</th>
                  <th className="px-2 py-2 text-right font-medium">Students</th>
                  <th className="px-2 py-2 text-right font-medium">AI calls (30d)</th>
                  <th className="px-3 py-2 text-right font-medium" title="Credits left, and credits used so far">AI credits</th>
                  <th className="w-20 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-sm text-muted-foreground">
                      No institutes match. {anyFilter && <button type="button" className="text-primary underline" onClick={clearAll}>Clear filters</button>}
                    </td>
                  </tr>
                )}
                {shown.map((a) => {
                  const st = statusOf(a);
                  const t = a.trial;
                  const trialText =
                    t && !a.paid
                      ? t.daysLeft === null
                        ? "Trial, no end date"
                        : t.daysLeft < 0
                          ? `Trial ended ${-t.daysLeft}d ago`
                          : `Trial, ${t.daysLeft} day${t.daysLeft === 1 ? "" : "s"} left`
                      : a.paid
                        ? "Paying"
                        : "—";
                  const plan = a.record?.planName || a.platformPlan;
                  return (
                    <tr key={a.id} className={cn("cursor-pointer border-b last:border-0 hover:bg-accent/40", selected.has(a.id) && "bg-primary/5")} onClick={() => onOpenAccount(a.id)}>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Select ${a.name}`} />
                      </td>
                      <td className="max-w-[17rem] px-2 py-2.5">
                        <p className="truncate font-medium">{a.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{a.email || a.subdomain || a.id}</p>
                        <p className="text-xs text-muted-foreground">Registered {formatDay(a.createdAt)}</p>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", st.tone)}>{st.label}</span>
                      </td>
                      <td className="px-2 py-2.5 text-xs">{a.pmClass ? <span className="rounded border border-primary/40 px-1.5 py-0.5 font-medium text-primary">{PM_CLASS_LABEL[a.pmClass]}</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2 py-2.5 text-xs">{a.products.length ? a.products.map(productName).join(", ") : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2 py-2.5 text-xs">
                        <p>{trialText}</p>
                        {plan && <p className="text-muted-foreground">{plan}</p>}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{a.activeNow || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{a.students}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{a.calls30?.calls ? a.calls30.calls.toLocaleString("en-IN") : <span className="text-muted-foreground">—</span>}</td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", a.credits?.low && "font-medium text-amber-600")}>
                        {a.credits ? (
                          <>
                            {Math.round(a.credits.balance).toLocaleString("en-IN")} left
                            <span className="block text-xs font-normal text-muted-foreground">{Math.round(a.credits.used).toLocaleString("en-IN")} used</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onOpenAccount(a.id); }}>
                          <Pencil className="mr-1 h-3 w-3" /> {a.record ? "Edit" : "Add details"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {rows.length ? `${page * PAGE + 1}–${Math.min(rows.length, page * PAGE + PAGE)} of ${rows.length}` : "0"} · click a row for full details
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} institutes={data.institutes} records={data.records} pmConfigured={data.pmConfigured} />
    </div>
  );
}
