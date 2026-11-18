import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFeatureCosts } from "@/services/external-apis-api";
import { count, credits, humanize, optionsFrom, usd, vendorName } from "./format";
import { EmptyNote, ErrorNote, FilterSelect, Pager } from "./parts";
import { slicePage, usePage } from "./usePage";

const FEATURE_COST_LIMIT = 300;

/** Answers "what is this cost for, and who is charging us for it?" one row per feature, vendor and model. */
export function FeatureCostCard({ hours, onWiden }: { hours: number; onWiden?: () => void }) {
  const costs = useFeatureCosts(hours);
  const [area, setArea] = useState<string | undefined>();
  const all = costs.data ?? [];
  const filtered = area ? all.filter((r) => r.feature_group === area) : all;
  const [page, setPage] = usePage([hours, area]);
  const view = slicePage(filtered, page, 10);
  const rows = view.rows;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Where the cost comes from</CardTitle>
          <p className="text-xs text-muted-foreground">
            Each feature, with the vendor and model behind it. Highest cost first.
          </p>
        </div>
        <FilterSelect
          label="Area"
          format={humanize}
          value={area}
          onChange={setArea}
          options={optionsFrom(all.map((r) => r.feature_group), area)}
        />
      </CardHeader>
      <CardContent>
        {costs.isError ? (
          <ErrorNote title="Could not load cost by feature" error={costs.error} onRetry={() => costs.refetch()} />
        ) : costs.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length ? (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Vendor cost</TableHead>
                <TableHead className="text-right">Credits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.use_case}:${r.feature_group}:${r.vendor}:${r.model_id ?? ""}`}>
                  <TableCell>
                    <div className="font-medium">{r.feature}</div>
                    <div className="text-xs capitalize text-muted-foreground">{humanize(r.feature_group)}</div>
                  </TableCell>
                  <TableCell className="text-xs">{vendorName(r.vendor)}</TableCell>
                  <TableCell className="break-all font-mono text-xs">{r.model_id ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{count(r.calls)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.unpriced_calls === r.calls ? "Not recorded" : usd(r.cost_usd)}
                    {r.unpriced_calls > 0 && r.unpriced_calls < r.calls && (
                      <div className="text-xs text-muted-foreground">{count(r.unpriced_calls)} calls not priced</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{credits(r.credits)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager page={view.page} totalPages={view.totalPages} total={view.total} onPage={setPage} />
          {all.length >= FEATURE_COST_LIMIT && (
            <p className="pt-2 text-xs text-muted-foreground">
              Showing the {FEATURE_COST_LIMIT} most expensive feature, vendor and model combinations; the rest cost less.
            </p>
          )}
          </>
        ) : (
          <EmptyNote what="AI calls" hours={hours} onWiden={onWiden} />
        )}
      </CardContent>
    </Card>
  );
}
