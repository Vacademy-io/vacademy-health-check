import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useVendorLogDetail,
  useVendorLogs,
  type VendorLogFilters,
  type VendorLogSource,
} from "@/services/external-apis-api";
import { dateTime, humanize, optionsFrom, vendorName } from "./format";
import { EmptyNote, ErrorNote, FilterSelect, JsonBlock, Pager } from "./parts";

const seconds = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`);
const money = (amount: number | null, currency: string | null) => {
  if (amount == null) return "—";
  const digits = currency === "USD" && amount < 0.01 ? 6 : 2;
  return `${currency ? `${currency} ` : ""}${amount.toFixed(digits)}`;
};

export function VendorLogCard({ title, description, emptyWhat, emptyHint, onWiden, source, hours, operationLabel, amountLabel, showInstitute, showDuration, showCreditsBilled }: {
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
}) {
  const [filters, setFilters] = useState<VendorLogFilters>({});
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const logs = useVendorLogs(source, hours, filters, page);
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
          <FilterSelect label="Vendor" format={vendorName} value={filters.vendor} onChange={(vendor) => set({ vendor })} options={optionsFrom(rows.map((r) => r.vendor), filters.vendor)} />
          <FilterSelect label="Status" format={humanize} value={filters.status} onChange={(status) => set({ status })} options={optionsFrom(rows.map((r) => r.status), filters.status)} />
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
                    <TableCell><Badge variant="outline">{humanize(r.status)}</Badge></TableCell>
                    {showInstitute && <TableCell className="text-xs">{r.institute_name ?? r.institute_id ?? "—"}</TableCell>}
                    {showDuration && <TableCell className="text-right tabular-nums">{seconds(r.duration_ms)}</TableCell>}
                    {amountLabel && <TableCell className="text-right tabular-nums">{money(r.amount, r.currency)}</TableCell>}
                    {showCreditsBilled && <TableCell className="text-xs">{r.credits_billed ? "Charged" : "Not charged"}</TableCell>}
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={r.error ?? undefined}>{humanize(r.error)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} hasNext={page + 1 < (logs.data?.total_pages ?? 0)} onPage={setPage} />
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
              <JsonBlock title="Payload" body={detail.data.payload} empty="No payload stored" />
              <JsonBlock title="Response" body={detail.data.response} empty="No response stored" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
