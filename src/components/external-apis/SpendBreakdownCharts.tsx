import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type SpendBreakdown, useSpendBreakdown } from "@/services/external-apis-api";
import { pivotSpend, splitOf, type SpendBucket, type SpendSeries } from "./breakdown";
import { credits, usd, vendorName } from "./format";
import { ErrorNote } from "./parts";

const featureName = (raw: string) => raw || "Feature not recorded";

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />;
}

function SplitTooltip({ bucket, series, format }: {
  bucket: SpendBucket;
  series: SpendSeries[];
  format: (n: number) => string;
}) {
  const { parts, total } = splitOf(bucket, series);
  return (
    <div className="min-w-48 rounded-md border bg-card p-3 text-xs shadow-md">
      <p className="mb-2 font-medium">{new Date(bucket.bucket).toLocaleString()}</p>
      {parts.length ? (
        <ul className="space-y-1">
          {parts.map((p) => (
            <li key={p.series.key} className="flex items-center gap-2">
              <Swatch color={p.series.color} />
              <span className="flex-1 text-muted-foreground">{p.series.label}</span>
              <span className="tabular-nums">{format(p.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Nothing in this period</p>
      )}
      {parts.length > 1 && (
        <p className="mt-2 flex justify-between border-t pt-2 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{format(total)}</span>
        </p>
      )}
    </div>
  );
}

function StackedChart({ title, data, series, format, hourly }: {
  title: string;
  data: SpendBucket[];
  series: SpendSeries[];
  format: (n: number) => string;
  hourly: boolean;
}) {
  const label = (v: string) =>
    hourly
      ? new Date(v).toLocaleTimeString("en", { hour: "numeric", hour12: true })
      : new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" });
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">Hover a bar for the split.</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} barCategoryGap={2}>
            <CartesianGrid vertical={false} className="stroke-muted" />
            <XAxis dataKey="bucket" tick={{ fontSize: 12 }} tickFormatter={label} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={56} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <SplitTooltip bucket={payload[0].payload as SpendBucket} series={series} format={format} />
                ) : null
              }
            />
            {series.map((s) => (
              // The card-coloured outline is the gap that keeps neighbouring segments apart.
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId="split" fill={s.color}
                stroke="hsl(var(--card))" strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">View as table</summary>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  {series.map((s) => <TableHead key={s.key} className="text-right">{s.label}</TableHead>)}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.bucket}>
                    <TableCell className="whitespace-nowrap">{new Date(row.bucket).toLocaleString()}</TableCell>
                    {series.map((s) => (
                      <TableCell key={s.key} className="text-right tabular-nums">{format(Number(row[s.key]) || 0)}</TableCell>
                    ))}
                    <TableCell className="text-right font-medium tabular-nums">{format(splitOf(row, series).total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

/** Vendor cost and credits over time, each bar split by vendor or by feature. AI usage only. */
export function SpendBreakdownCharts({ hours }: { hours: number }) {
  const [by, setBy] = useState<SpendBreakdown>("vendor");
  const spend = useSpendBreakdown(hours, by);
  const pivot = useMemo(
    () => pivotSpend(spend.data ?? [], by === "vendor" ? vendorName : featureName),
    [spend.data, by],
  );

  if (spend.isError) {
    return <ErrorNote title="Could not load the spend charts" error={spend.error} onRetry={() => spend.refetch()} />;
  }
  if (spend.isLoading) return <Skeleton className="h-72 w-full" />;
  if (!spend.data?.length) return null;

  const hourly = hours <= 48;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
          {pivot.series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <Swatch color={s.color} />
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
        <Select value={by} onValueChange={(v) => setBy(v as SpendBreakdown)}>
          <SelectTrigger className="w-44" aria-label="Split bars by"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="vendor">Split by vendor</SelectItem>
            <SelectItem value="feature">Split by feature</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <StackedChart title="Vendor cost (USD)" data={pivot.cost} series={pivot.series} format={usd} hourly={hourly} />
        <StackedChart title="Credits deducted" data={pivot.credits} series={pivot.series} format={credits} hourly={hourly} />
      </div>
    </div>
  );
}
