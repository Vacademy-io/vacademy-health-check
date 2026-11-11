import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useAiComparison,
  useAiTopInstitutes,
  useFeatureCosts,
  type ProviderTotalsRow,
} from "@/services/external-apis-api";
import { count, credits, usd, vendorName } from "./format";
import { groupSum, leader, pct, pctLabel, periodWords } from "./insights";
import { ErrorNote, Highlights } from "./parts";

/** Plain sentences about the AI spend in this window. */
export function OverviewHighlights({ hours, providers }: { hours: number; providers: ProviderTotalsRow[] }) {
  const { now } = useAiComparison(hours);
  const features = useFeatureCosts(hours);
  const institutes = useAiTopInstitutes(hours);

  const cost = providers.reduce((n, r) => n + r.cost_usd, 0);
  const calls = providers.reduce((n, r) => n + r.calls, 0);
  const unpriced = providers.reduce((n, r) => n + r.unpriced_calls, 0);
  const topVendor = leader(providers, (r) => r.cost_usd);
  const byFeature = groupSum(features.data ?? [], (r) => r.feature, (r) => r.cost_usd);
  const topFeature = byFeature[0];
  const topInstitute = leader(institutes.data ?? [], (r) => r.cost_usd);
  const period = periodWords(hours);

  return (
    <Highlights
      items={[
        topVendor &&
          `${vendorName(topVendor.row.provider)} is ${pctLabel(topVendor.share)} of vendor cost (${usd(topVendor.row.cost_usd)} of ${usd(cost)}).`,
        topFeature && topFeature.total > 0 &&
          `The most expensive feature is ${topFeature.key}, at ${usd(topFeature.total)} (${pctLabel(pct(topFeature.total, cost))} of the total).`,
        topInstitute &&
          `${topInstitute.row.institute_name ?? "One institute"} used the most: ${usd(topInstitute.row.cost_usd)} of vendor cost, ${credits(topInstitute.row.credits)} credits charged.`,
        now.credits > 0 && cost > 0 &&
          `Every 100 credits charged to institutes cost us ${usd((cost / now.credits) * 100)} at the vendor.`,
        now.dropped_calls > 0 &&
          `${count(now.dropped_calls)} AI calls in the last ${period} ran but weren't charged, because the institute was out of credits.`,
        calls > 0 && (pct(unpriced, calls) ?? 0) >= 5 &&
          `${pctLabel(pct(unpriced, calls))} of calls have no recorded vendor cost, so the real spend is higher than shown.`,
      ]}
    />
  );
}

/** Which institutes drive AI spend, and whether we charge them for it. */
export function TopInstitutesCard({ hours }: { hours: number }) {
  const top = useAiTopInstitutes(hours);
  const rows = top.data ?? [];
  if (top.isError) return <ErrorNote title="Could not load spend by institute" error={top.error} onRetry={() => top.refetch()} />;
  if (!top.isLoading && !rows.length) return null;
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Institutes using the most</CardTitle>
        <p className="text-xs text-muted-foreground">
          Vendor cost against the credits we charged them. A high cost with few credits means usage we are paying for.
        </p>
      </CardHeader>
      <CardContent>
        {top.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Institute</TableHead>
                  <TableHead className="text-right">AI calls</TableHead>
                  <TableHead className="text-right">Vendor cost</TableHead>
                  <TableHead className="text-right">Credits charged</TableHead>
                  <TableHead className="text-right">Not charged (out of credits)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.institute_id}>
                    <TableCell>
                      <Link className="font-medium hover:underline" to={`/institutes/${r.institute_id}`}>
                        {r.institute_name ?? r.institute_id}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{count(r.calls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(r.cost_usd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{credits(r.credits)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.dropped_calls ? count(r.dropped_calls) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
