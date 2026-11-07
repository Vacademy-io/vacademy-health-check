import { useState } from "react";
import { Link } from "react-router-dom";
import { Coins, DollarSign, Unplug, Zap } from "lucide-react";
import { KeyAccountsTab } from "@/components/external-apis/KeyAccountsTab";
import { LoggedVendorsCard } from "@/components/external-apis/LoggedVendorsCard";
import { NotificationLogCard } from "@/components/external-apis/NotificationLogCard";
import { VendorLogCard } from "@/components/external-apis/VendorLogCard";
import { FeatureCostCard } from "@/components/external-apis/FeatureCostCard";
import { RecentCallsTab } from "@/components/external-apis/RecentCallsTab";
import { SpendBreakdownCharts } from "@/components/external-apis/SpendBreakdownCharts";
import { chargeLabel, count, credits, dateTime, humanize, LIKELY_VENDOR_PREFIX, MODEL_VENDOR_PREFIX, NO_VENDOR, usd, vendorName } from "@/components/external-apis/format";
import { EmptyNote, ErrorNote, FilterSelect, JsonBlock, Pager } from "@/components/external-apis/parts";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BILLING_LABELS,
  CAPTURE_LABELS,
  EXTERNAL_VENDORS,
  type CaptureLevel,
} from "@/lib/external-api-catalog";
import {
  AI_PAGE_SIZE,
  useAiCalls,
  useCommunicationLogDetail,
  useCommunicationLogs,
  useProviderTotals,
  type AiCallFilters,
  type AiCallRow,
  type CommunicationLogFilters,
} from "@/services/external-apis-api";

const RANGES = [
  { value: "1", label: "Last 1 hour" },
  { value: "24", label: "Last 24 hours" },
  { value: "168", label: "Last 7 days" },
  { value: "720", label: "Last 30 days" },
];

const CHARGE_STATUSES = [
  "POSTED", "DROPPED_INSUFFICIENT", "SKIPPED_NO_INSTITUTE", "NOT_APPLICABLE", "REFUNDED", "PARTIAL_REFUND",
];

function OverviewTab({ hours, onWiden }: { hours: number; onWiden?: () => void }) {
  const totals = useProviderTotals(hours);
  const rows = totals.data ?? [];
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((acc, r) => acc + pick(r), 0);
  const unpriced = sum((r) => r.unpriced_calls);

  const noVendor = rows
    .filter((r) => r.provider === NO_VENDOR || r.provider.startsWith(MODEL_VENDOR_PREFIX))
    .reduce((acc, r) => acc + r.calls, 0);
  const likelyVendor = rows
    .filter((r) => r.provider.startsWith(LIKELY_VENDOR_PREFIX))
    .reduce((acc, r) => acc + r.calls, 0);

  if (totals.isError) return <ErrorNote title="Could not load AI usage" error={totals.error} onRetry={() => totals.refetch()} />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {totals.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard title="Metered calls" value={count(sum((r) => r.calls))} icon={Zap} />
            <StatCard
              title="Vendor cost"
              value={usd(sum((r) => r.cost_usd))}
              description={unpriced ? `${count(unpriced)} calls have no recorded cost` : undefined}
              icon={DollarSign}
            />
            <StatCard title="Credits deducted" value={credits(sum((r) => r.credits))} description="Net of refunds" icon={Coins} />
            <StatCard
              title="Calls not billed"
              value={count(sum((r) => r.unbilled_calls + r.dropped_calls))}
              description="Unbilled gap or insufficient credits"
              icon={Unplug}
            />
          </>
        )}
      </div>

      <SpendBreakdownCharts hours={hours} />

      {rows.length > 0 && <FeatureCostCard hours={hours} onWiden={onWiden} />}

      <Card>
        <CardHeader><CardTitle className="text-base">By vendor</CardTitle></CardHeader>
        <CardContent>
          {totals.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Vendor cost</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead className="text-right">No cost recorded</TableHead>
                  <TableHead className="text-right">Not billed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.provider}>
                    <TableCell className="font-medium">{vendorName(r.provider)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(r.calls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(r.tokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.unpriced_calls === r.calls ? "Not recorded" : usd(r.cost_usd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{credits(r.credits)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(r.unpriced_calls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(r.unbilled_calls + r.dropped_calls)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyNote what="AI calls" hours={hours} onWiden={onWiden} />
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {likelyVendor > 0 && `${count(likelyVendor)} calls did not record their vendor, so "(likely)" comes from today's routing or the feature. `}
            {noVendor > 0 && `${count(noVendor)} calls cannot be traced to a vendor. `}
            This covers AI calls only. See All vendors for everything else.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AiCallsTab({ hours, onWiden }: { hours: number; onWiden?: () => void }) {
  const [filters, setFilters] = useState<AiCallFilters>({});
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<AiCallRow | null>(null);
  const calls = useAiCalls(hours, filters, page);
  const providers = useProviderTotals(hours);
  const rows = (calls.data ?? []).slice(0, AI_PAGE_SIZE);

  const set = (patch: AiCallFilters) => {
    setPage(0);
    setFilters((f) => ({ ...f, ...patch }));
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">AI calls</CardTitle>
          <p className="text-xs text-muted-foreground">
            Cost and credits per call. Prompts and vendor responses are not stored for these calls.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Vendor"
            format={vendorName}
            value={filters.provider}
            onChange={(provider) => set({ provider })}
            options={(providers.data ?? []).map((p) => p.provider)}
          />
          <FilterSelect
            label="Charge"
            format={chargeLabel}
            value={filters.chargeStatus}
            onChange={(chargeStatus) => set({ chargeStatus })}
            options={CHARGE_STATUSES}
          />
        </div>
      </CardHeader>
      <CardContent>
        {calls.isError ? (
          <ErrorNote title="Could not load AI calls" error={calls.error} onRetry={() => calls.refetch()} />
        ) : calls.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Vendor / model</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead>Institute</TableHead>
                  <TableHead>Charge</TableHead>
                  <TableHead className="text-right">Vendor cost</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                    <TableCell className="whitespace-nowrap text-xs">{dateTime(r.occurred_at)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{vendorName(r.provider)}</div>
                      <div className="text-xs text-muted-foreground">{r.model_id ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs">{r.feature}</TableCell>
                    <TableCell className="text-xs">{r.institute_name ?? r.institute_id ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{chargeLabel(r.charge_status)}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{usd(r.real_cost_usd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{credits(r.credits_charged - r.refunded_credits)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} hasNext={(calls.data?.length ?? 0) > AI_PAGE_SIZE} onPage={setPage} />
          </>
        ) : (
          <EmptyNote
            what={filters.provider || filters.chargeStatus ? "AI calls match these filters" : "AI calls"}
            hours={hours}
            onWiden={onWiden}
          />
        )}
      </CardContent>

      <Dialog open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{vendorName(open?.provider)} call</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {([
                  ["Time", dateTime(open.occurred_at)],
                  ["Model", open.model_id ?? "—"],
                  ["Feature", open.feature],
                  ["Called from", open.source_service],
                  ["Institute", open.institute_id
                    ? <Link className="hover:underline" to={`/institutes/${open.institute_id}`}>{open.institute_name ?? open.institute_id}</Link>
                    : "—"],
                  ["Customer's own key", open.byo_key ? "Yes" : "No"],
                  ["Prompt / completion tokens", `${count(open.prompt_tokens)} / ${count(open.completion_tokens)}`],
                  ["Characters / seconds", `${count(open.characters)} / ${count(open.seconds)}`],
                  ["Vendor cost", `${usd(open.real_cost_usd)} (${open.cost_source})`],
                  ["Credits charged / refunded", `${credits(open.credits_charged)} / ${credits(open.refunded_credits)}`],
                  ["Charge status", chargeLabel(open.charge_status)],
                  ["Billing mode", open.free_reason ? `${open.billing_mode} (${open.free_reason})` : open.billing_mode],
                  ["Ledger transaction", open.ledger_tx_id ?? "—"],
                ] as const).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="break-all">{v}</dd>
                  </div>
                ))}
              </dl>
              <JsonBlock
                title="Price snapshot"
                body={open.price_snapshot ? JSON.stringify(open.price_snapshot) : null}
                empty="No price snapshot recorded"
              />
              <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                The request and response for this call were not stored, so there is no payload to show.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function MessagingLogsTab({ hours, onWiden }: { hours: number; onWiden?: () => void }) {
  const [filters, setFilters] = useState<CommunicationLogFilters>({});
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const logs = useCommunicationLogs(hours, filters, page);
  const detail = useCommunicationLogDetail(openId);
  const rows = logs.data?.content ?? [];

  const set = (patch: CommunicationLogFilters) => {
    setPage(0);
    setFilters((f) => ({ ...f, ...patch }));
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Messaging payloads</CardTitle>
          <p className="text-xs text-muted-foreground">
            Stored request and response bodies. Only WATI bulk sends write here today. Recipients and credentials are masked.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect label="Source" value={filters.source} onChange={(source) => set({ source })} options={["WHATSAPP", "EMAIL"]} format={vendorName} />
          <FilterSelect label="Status" value={filters.status} onChange={(status) => set({ status })} options={["INITIATED", "SUCCESS", "FAILED"]} format={humanize} />
        </div>
      </CardHeader>
      <CardContent>
        {logs.isError ? (
          <ErrorNote title="Could not load messaging payloads" error={logs.error} onRetry={() => logs.refetch()} />
        ) : logs.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <TableCell className="whitespace-nowrap text-xs">{dateTime(r.createdAt)}</TableCell>
                    <TableCell>{vendorName(r.source)}</TableCell>
                    <TableCell><Badge variant="outline">{humanize(r.status)}</Badge></TableCell>
                    <TableCell className="max-w-md truncate text-xs text-muted-foreground">{r.errorMessage ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} hasNext={page + 1 < (logs.data?.totalPages ?? 0)} onPage={setPage} />
          </>
        ) : (
          <EmptyNote what="stored payloads" hours={hours} hint="Only WATI bulk sends store a payload today." onWiden={onWiden} />
        )}
      </CardContent>

      <Dialog open={openId != null} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Messaging log</DialogTitle></DialogHeader>
          {detail.isError ? (
            <ErrorNote title="Could not load this log" error={detail.error} />
          ) : detail.isLoading || !detail.data ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="space-y-4">
              {detail.data.summary.errorMessage && (
                <p className="rounded-md bg-red-50 p-3 text-xs text-red-800">{detail.data.summary.errorMessage}</p>
              )}
              <JsonBlock title="Payload" body={detail.data.payload} empty="No payload stored" />
              <JsonBlock title="Response" body={detail.data.response} empty="No response stored" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function VendorsTab() {
  const [search, setSearch] = useState("");
  const [capture, setCapture] = useState<string | undefined>();
  const needle = search.trim().toLowerCase();
  const vendors = EXTERNAL_VENDORS.filter(
    (v) =>
      (!capture || CAPTURE_LABELS[v.capture] === capture) &&
      (!needle || `${v.name} ${v.category} ${v.services} ${v.keyConfig}`.toLowerCase().includes(needle)),
  );
  const fully = EXTERNAL_VENDORS.filter((v) => v.capture === ("full" satisfies CaptureLevel)).length;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">All vendors</CardTitle>
          <p className="text-xs text-muted-foreground">
            {EXTERNAL_VENDORS.length} integrations found in the code, {fully} with full payload capture. From a code scan on 5 Nov 2026, not live data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input className="w-56" placeholder="Search vendors" value={search} onChange={(e) => setSearch(e.target.value)} />
          <FilterSelect label="Capture" value={capture} onChange={setCapture} options={Object.values(CAPTURE_LABELS)} />
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Services</TableHead>
              <TableHead>Key config (names only)</TableHead>
              <TableHead>Logs</TableHead>
              <TableHead>Credits</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((v) => (
              <TableRow key={v.name}>
                <TableCell className="font-medium">{v.name}</TableCell>
                <TableCell className="text-xs">{v.category}</TableCell>
                <TableCell className="text-xs">{v.services}</TableCell>
                <TableCell className="font-mono text-xs">{v.keyConfig}</TableCell>
                <TableCell>
                  <Badge variant="outline">{CAPTURE_LABELS[v.capture]}</Badge>
                  {v.store && <div className="mt-1 text-xs text-muted-foreground">{v.store}</div>}
                </TableCell>
                <TableCell className="text-xs">{BILLING_LABELS[v.billing]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function ExternalApisPage() {
  const [range, setRange] = useState("168");
  const [tab, setTab] = useState("overview");
  const hours = Number(range);
  // Offered on empty results, so "nothing here" is never a dead end.
  const onWiden = hours < 720 ? () => setRange("720") : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="External APIs"
        description="Third-party API usage, stored payloads, vendor cost and credit deductions"
        actions={
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-40" aria-label="Time range"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="recent">Recent calls</TabsTrigger>
          <TabsTrigger value="ai">AI calls</TabsTrigger>
          <TabsTrigger value="telephony">Telephony</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="messaging">Messaging</TabsTrigger>
          <TabsTrigger value="calls">Logged calls</TabsTrigger>
          <TabsTrigger value="keys">Keys &amp; accounts</TabsTrigger>
          <TabsTrigger value="vendors">All vendors</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab hours={hours} onWiden={onWiden} /></TabsContent>
        <TabsContent value="recent">
          <RecentCallsTab hours={hours} onWiden={onWiden} onOpenMessaging={() => setTab("messaging")} />
        </TabsContent>
        <TabsContent value="ai"><AiCallsTab hours={hours} onWiden={onWiden} /></TabsContent>
        <TabsContent value="telephony">
          <VendorLogCard
            title="Calls"
            emptyWhat="calls"
            emptyHint="Calls appear here once an institute with telephony set up places one."
            onWiden={onWiden}
            description="One row per call attempt. Provider webhook payloads are masked, and the price is as the vendor reported it."
            source="telephony"
            hours={hours}
            operationLabel="Direction"
            amountLabel="Vendor price"
            showInstitute
            showDuration
            showCreditsBilled
          />
        </TabsContent>
        <TabsContent value="payments" className="space-y-6">
          <VendorLogCard
            title="Payments"
            emptyWhat="payments"
            onWiden={onWiden}
            description="Gateway data stored with each payment, masked. Offline payments recorded by admins also appear here."
            source="payments"
            hours={hours}
            operationLabel="Order status"
            amountLabel="Amount"
          />
          <VendorLogCard
            title="Webhooks received"
            emptyWhat="webhooks"
            onWiden={onWiden}
            description="Events gateways sent to us. Our outbound requests to gateways are not stored."
            source="webhooks"
            hours={hours}
            operationLabel="Event"
          />
        </TabsContent>
        <TabsContent value="messaging" className="space-y-6">
          <MessagingLogsTab hours={hours} onWiden={onWiden} />
          <NotificationLogCard hours={hours} onWiden={onWiden} />
        </TabsContent>
        <TabsContent value="calls" className="space-y-6">
          <VendorLogCard
            title="Logged API calls"
            emptyWhat="logged calls"
            emptyHint="Serper calls appear after a video that searches for real images is generated. Turn on automatic capture under All vendors to log more."
            onWiden={onWiden}
            description="One row per real request, including failed ones, for every vendor that logs here (Serper today). Serper cost comes from the price entered under Keys & accounts, for new requests only."
            source="calls"
            hours={hours}
            operationLabel="Operation"
            amountLabel="Cost"
            showInstitute
            showDuration
          />
        </TabsContent>
        <TabsContent value="keys"><KeyAccountsTab /></TabsContent>
        <TabsContent value="vendors" className="space-y-6">
          <LoggedVendorsCard hours={hours} onWiden={onWiden} />
          <VendorsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
