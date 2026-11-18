import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useVendorLogDetail,
  useVendorLogs,
  useVendorOptions,
  type VendorLogFilters,
  type VendorLogSource,
} from "@/services/external-apis-api";
import { dateTime, humanize, optionsFrom, vendorName } from "./format";
import { httpMeaning } from "./insights";
import { EmptyNote, ErrorNote, FilterSelect, JsonBlock, Pager } from "./parts";
import { usePage } from "./usePage";
import { money } from "./balances";

/** Every status each log can hold, from the backend enums, so "Failed" is always offered. */
const STATUSES: Record<VendorLogSource, string[]> = {
  telephony: ["INITIATED", "QUEUED", "COUNSELLOR_RINGING", "COUNSELLOR_ANSWERED", "IN_PROGRESS", "COMPLETED", "NO_ANSWER", "BUSY", "FAILED", "CANCELLED"],
  payments: ["PAID", "PAYMENT_PENDING", "FAILED"],
  webhooks: ["RECEIVED", "PROCESSED", "FAILED"],
  calls: ["SUCCESS", "FAILED"],
};

const seconds = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`);

export function VendorLogCard({ title, description, emptyWhat, emptyHint, onWiden, source, hours, operationLabel, amountLabel, showInstitute, showDuration, showCreditsBilled, showHttpStatus, preset }: {
  title: string;
  description: string;
  emptyWhat: string;
  emptyHint?: string;
  onWiden?: () => void;
  source: VendorLogSource;
  hours: number;
  operationLabel: string;
  amountLabel?: string;
  showInstitute?: boolean;
  showDuration?: boolean;
  showCreditsBilled?: boolean;
  /** A status code column, for logged vendor calls. */
  showHttpStatus?: boolean;
  /** Filters to start with (a vendor, FAILED). Remount with a new key to apply new ones. */
  preset?: VendorLogFilters;
}) {
  const [filters, setFilters] = useState<VendorLogFilters>(preset ?? {});
  const [page, setPage] = usePage([hours, filters]);
  const [openId, setOpenId] = useState<string | null>(null);
  const logs = useVendorLogs(source, hours, filters, page);
  const vendorOptions = useVendorOptions(source, hours);
  const detail = useVendorLogDetail(source, openId);
  const rows = logs.data?.content ?? [];

  const set = (patch: VendorLogFilters) => {
    setPage(0);
    setFilters((f) => ({ ...f, ...patch }));
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect label="Vendor" format={vendorName} value={filters.vendor} onChange={(vendor) => set({ vendor })} options={optionsFrom([...(vendorOptions.data ?? []), ...rows.map((r) => r.vendor)], filters.vendor)} />
          <FilterSelect label="Status" format={humanize} value={filters.status} onChange={(status) => set({ status })} options={optionsFrom([...STATUSES[source], ...rows.map((r) => r.status)], filters.status)} />
        </div>
      </CardHeader>
      <CardContent>
        {logs.isError ? (
          <ErrorNote title={`Could not load ${title.toLowerCase()}`} error={logs.error} onRetry={() => logs.refetch()} />
        ) : logs.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>{operationLabel}</TableHead>
                  <TableHead>Status</TableHead>
                  {showHttpStatus && <TableHead>Status code</TableHead>}
                  {showInstitute && <TableHead>Institute</TableHead>}
                  {showDuration && <TableHead className="text-right">Duration</TableHead>}
                  {amountLabel && <TableHead className="text-right">{amountLabel}</TableHead>}
                  {showCreditsBilled && <TableHead>Credits</TableHead>}
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <TableCell className="whitespace-nowrap text-xs">{dateTime(r.occurred_at)}</TableCell>
                    <TableCell className="font-medium">{vendorName(r.vendor)}</TableCell>
                    <TableCell className="text-xs">{humanize(r.operation)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "FAILED" ? "destructive" : "outline"}>{humanize(r.status)}</Badge>
                    </TableCell>
                    {showHttpStatus && (
                      <TableCell className="text-xs">
                        {r.http_status === undefined ? (
                          "—"
                        ) : (
                          <>
                            <span className="tabular-nums">{r.http_status ?? "None"}</span>
                            {(r.status === "FAILED" || (r.http_status ?? 0) >= 400) && (
                              <div className="text-muted-foreground">{httpMeaning(r.http_status)}</div>
                            )}
                          </>
                        )}
                      </TableCell>
                    )}
                    {showInstitute && <TableCell className="text-xs">{r.institute_name ?? r.institute_id ?? "—"}</TableCell>}
                    {showDuration && <TableCell className="text-right tabular-nums">{seconds(r.duration_ms)}</TableCell>}
                    {amountLabel && <TableCell className="text-right tabular-nums">{money(r.amount, r.currency)}</TableCell>}
                    {showCreditsBilled && (
                      <TableCell className="text-xs">
                        {r.vendor === "EXOTEL" ? "Institute pays" : r.credits_billed == null ? "—" : r.credits_billed ? "Charged" : "Not charged"}
                      </TableCell>
                    )}
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={r.error ?? undefined}>{humanize(r.error)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} totalPages={logs.data?.total_pages ?? null} total={logs.data?.total_elements ?? null} onPage={setPage} />
          </>
        ) : (
          <EmptyNote what={emptyWhat} hours={hours} hint={emptyHint} onWiden={onWiden} />
        )}
      </CardContent>

      <Dialog open={openId != null} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          {detail.isError ? (
            <ErrorNote title="Could not load this log" error={detail.error} />
          ) : detail.isLoading || !detail.data ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="space-y-4">
              <JsonBlock
                title={source === "calls" ? "What we sent" : "Payload"}
                body={detail.data.payload}
                empty={source === "calls" ? "Not kept: bodies are kept for failed calls only" : "No payload stored"}
              />
              <JsonBlock
                title={source === "calls" ? "What the vendor answered" : "Response"}
                body={detail.data.response}
                empty={source === "calls" ? "Not kept: bodies are kept for failed calls only" : "No response stored"}
              />
              {source === "calls" && (
                <p className="text-xs text-muted-foreground">Keys, tokens, phone numbers and emails are hidden before anything is kept.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
