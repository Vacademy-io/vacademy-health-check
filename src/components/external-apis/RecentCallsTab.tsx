import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  RECENT_PAGE_SIZE,
  type RecentCallFilters,
  type RecentCallRow,
  type RecentCallSource,
  useRecentCalls,
  useVendorLogDetail,
} from "@/services/external-apis-api";
import { count, credits, dateTime, humanize, sourceLabel, vendorName } from "./format";
import { EmptyNote, ErrorNote, FilterSelect, JsonBlock, Pager } from "./parts";

const SOURCES: RecentCallSource[] = ["ai", "calls", "telephony", "payments", "webhooks"];

const money = (amount: number | null, currency: string | null) => {
  if (amount == null) return "—";
  const digits = currency === "USD" && amount !== 0 && amount < 0.01 ? 6 : 2;
  return `${currency === "USD" ? "$" : currency ? `${currency} ` : ""}${amount.toFixed(digits)}`;
};

const duration = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`);

function CallDetail({ call }: { call: RecentCallRow }) {
  const logged = call.source !== "ai";
  const bodies = useVendorLogDetail(logged ? call.source : "calls", logged ? call.id : null);
  const facts: Array<[string, React.ReactNode]> = [
    ["Time", dateTime(call.occurred_at)],
    ["Source", sourceLabel(call.source)],
    ["Vendor", vendorName(call.vendor)],
    [call.source === "ai" ? "Feature" : "Operation", humanize(call.operation)],
    [call.source === "ai" ? "Model" : "HTTP status", call.detail ?? "—"],
    ["Status", call.failed ? `${humanize(call.status)} (failed)` : humanize(call.status)],
    ["Institute", call.institute_id
      ? <Link className="hover:underline" to={`/institutes/${call.institute_id}`}>{call.institute_name ?? call.institute_id}</Link>
      : "—"],
    [call.source === "payments" ? "Amount" : "Vendor cost", money(call.amount, call.currency)],
    ["Credits", call.credits == null ? "—" : credits(call.credits)],
    ["Duration", duration(call.duration_ms)],
    ["Tokens", call.tokens == null ? "—" : count(call.tokens)],
    ["Error", call.error ?? "—"],
    ["Record id", call.id],
  ];
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="break-all">{v}</dd>
          </div>
        ))}
      </dl>
      {!logged ? (
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          The request and response of AI calls are not stored, so there is no payload to show. The AI calls tab has the price snapshot.
        </p>
      ) : bodies.isError ? (
        <ErrorNote title="Could not load the stored payload" error={bodies.error} />
      ) : bodies.isLoading || !bodies.data ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <JsonBlock title="Payload" body={bodies.data.payload} empty="No payload stored" />
          <JsonBlock title="Response" body={bodies.data.response} empty="No response stored" />
        </>
      )}
    </div>
  );
}

/** Every recorded third-party call in one list, newest first, each one openable. */
export function RecentCallsTab({ hours, onWiden, onOpenMessaging }: {
  hours: number;
  onWiden?: () => void;
  onOpenMessaging: () => void;
}) {
  const [filters, setFilters] = useState<RecentCallFilters>({});
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<RecentCallRow | null>(null);
  const calls = useRecentCalls(hours, filters, page);
  const rows = (calls.data ?? []).slice(0, RECENT_PAGE_SIZE);

  const set = (patch: RecentCallFilters) => {
    setPage(0);
    setFilters((f) => ({ ...f, ...patch }));
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Recent calls</CardTitle>
          <p className="text-xs text-muted-foreground">
            AI calls, logged vendor calls, telephony, payments and webhooks together, newest first. Open a row for everything stored about it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Source"
            format={(s) => sourceLabel(s as RecentCallSource)}
            value={filters.source}
            onChange={(source) => set({ source: source as RecentCallSource | undefined })}
            options={SOURCES}
          />
          <Button
            variant={filters.failedOnly ? "default" : "outline"}
            aria-pressed={!!filters.failedOnly}
            onClick={() => set({ failedOnly: !filters.failedOnly })}
          >
            {filters.failedOnly ? "Showing failures only" : "Show failures only"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {calls.isError ? (
          <ErrorNote title="Could not load recent calls" error={calls.error} onRetry={() => calls.refetch()} />
        ) : calls.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length ? (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>What</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Institute</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={`${r.source}:${r.id}`} className="cursor-pointer" onClick={() => setOpen(r)}>
                      <TableCell className="whitespace-nowrap text-xs">{dateTime(r.occurred_at)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{vendorName(r.vendor)}</div>
                        <div className="text-xs text-muted-foreground">{sourceLabel(r.source)}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{humanize(r.operation)}</div>
                        {r.detail && <div className="break-all text-muted-foreground">{r.source === "calls" ? `HTTP ${r.detail}` : r.detail}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.failed ? "destructive" : "outline"} className="whitespace-nowrap">{humanize(r.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.institute_name ?? r.institute_id ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.amount, r.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.credits == null ? "—" : credits(r.credits)}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={r.error ?? undefined}>{r.error ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager page={page} hasNext={(calls.data?.length ?? 0) > RECENT_PAGE_SIZE} onPage={setPage} />
          </>
        ) : (
          <EmptyNote
            what={filters.source || filters.failedOnly ? "calls match these filters" : "calls"}
            hours={hours}
            onWiden={onWiden}
          />
        )}
        <p className="pt-3 text-xs text-muted-foreground">
          WhatsApp and email are kept by the notification service, so they are listed separately.{" "}
          <button type="button" className="underline hover:text-foreground" onClick={onOpenMessaging}>Open Messaging</button>
        </p>
      </CardContent>

      <Dialog open={open != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{open ? `${vendorName(open.vendor)} · ${sourceLabel(open.source)}` : ""}</DialogTitle></DialogHeader>
          {open && <CallDetail call={open} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
