import { useState } from "react";
import { Link } from "react-router-dom";
import { useCreditUsageLive, useUsageSummary, type UsageWindow } from "@/services/usage-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Coins, Cpu, DollarSign, Zap } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

/** Selectable windows. Sub-day ones send `hours`, the rest send `days`. */
const RANGES: { value: string; label: string; window: UsageWindow }[] = [
  { value: "1h", label: "Last 1 hour", window: { hours: 1 } },
  { value: "24h", label: "Last 24 hours", window: { hours: 24 } },
  { value: "7d", label: "Last 7 days", window: { days: 7 } },
  { value: "30d", label: "Last 30 days", window: { days: 30 } },
  { value: "90d", label: "Last 90 days", window: { days: 90 } },
];

const fmtCredits = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Name when we have one, raw id when the institute row is gone. */
function InstituteCell({ id, name }: { id: string; name: string | null }) {
  return (
    <Link to={`/institutes/${id}`} title={id} className="hover:underline">
      {name ? (
        <span className="font-medium">{name}</span>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">{id}</span>
      )}
    </Link>
  );
}

export default function UsagePage() {
  const [range, setRange] = useState("30d");
  const activeWindow = RANGES.find((r) => r.value === range)?.window ?? { days: 30 };
  const { data, isLoading } = useUsageSummary(activeWindow);
  const { data: live, isLoading: liveLoading } = useCreditUsageLive();

  const hourly = data?.bucket === "hour";
  const formatBucket = (v: string) =>
    hourly
      ? new Date(v).toLocaleTimeString("en", { hour: "numeric", hour12: true })
      : new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Usage"
        description="Platform-wide AI token usage and costs"
        actions={
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* Live credit burn — independent of the range picker above */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Credit Burn</CardTitle>
            <p className="text-xs text-muted-foreground">
              Credits consumed platform-wide, net of refunds. Refreshes every minute.
            </p>
          </div>
          {live && (
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              as of {new Date(live.generated_at).toLocaleTimeString()}
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {liveLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Last 1 hour", w: live?.last_1h },
                { label: "Last 24 hours", w: live?.last_24h },
              ].map(({ label, w }) => (
                <div key={label} className="rounded-lg border p-4">
                  <p className="text-sm font-medium text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-bold">{fmtCredits(w?.credits_used)}</p>
                  <p className="text-xs text-muted-foreground">
                    credits · {(w?.request_count ?? 0).toLocaleString()} charged requests ·{" "}
                    {(w?.institute_count ?? 0).toLocaleString()} institutes
                  </p>
                </div>
              ))}
            </div>
          )}

          {!liveLoading && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">By institute</p>
                {live?.top_institutes?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Institute</TableHead>
                        <TableHead className="text-right">1h</TableHead>
                        <TableHead className="text-right">24h</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {live.top_institutes.map((inst) => (
                        <TableRow key={inst.institute_id}>
                          <TableCell>
                            <InstituteCell id={inst.institute_id} name={inst.institute_name} />
                          </TableCell>
                          <TableCell className="text-right">{fmtCredits(inst.credits_1h)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {fmtCredits(inst.credits_24h)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="py-6 text-sm text-muted-foreground">
                    No credits consumed in the last 24 hours
                  </p>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">By request type</p>
                {live?.by_request_type?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">1h</TableHead>
                        <TableHead className="text-right">24h</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {live.by_request_type.map((t) => (
                        <TableRow key={t.request_type}>
                          <TableCell className="font-medium">{t.request_type}</TableCell>
                          <TableCell className="text-right">{fmtCredits(t.credits_1h)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {fmtCredits(t.credits_24h)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="py-6 text-sm text-muted-foreground">
                    No credits consumed in the last 24 hours
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard
              title="Total Tokens"
              value={data?.total_tokens?.toLocaleString() ?? "0"}
              icon={Cpu}
            />
            <StatCard
              title="Total Cost"
              value={`$${Number(data?.total_cost ?? 0).toFixed(4)}`}
              icon={DollarSign}
            />
            <StatCard
              title="Credits Used"
              value={fmtCredits(data?.total_credits_used)}
              icon={Coins}
            />
            <StatCard
              title="Total Requests"
              value={data?.total_requests?.toLocaleString() ?? "0"}
              icon={Zap}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Usage by type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : data?.usage_by_type?.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.usage_by_type}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="request_type" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="total_tokens" name="Tokens" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No usage data</p>
            )}
          </CardContent>
        </Card>

        {/* Usage over time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{hourly ? "Hourly Usage" : "Daily Usage"}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : data?.usage_by_day?.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.usage_by_day}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => formatBucket(v as string)}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    labelFormatter={(v) =>
                      hourly
                        ? new Date(v as string).toLocaleString()
                        : new Date(v as string).toLocaleDateString()
                    }
                  />
                  <Legend />
                  <Line type="monotone" dataKey="total_tokens" name="Tokens" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="request_count" name="Requests" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No usage data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top institutes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Institutes by AI Usage</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : data?.top_institutes?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Institute</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.top_institutes.map((inst) => (
                  <TableRow key={inst.institute_id}>
                    <TableCell>
                      <InstituteCell id={inst.institute_id} name={inst.institute_name} />
                    </TableCell>
                    <TableCell className="text-right">{inst.total_tokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${Number(inst.total_cost).toFixed(4)}</TableCell>
                    <TableCell className="text-right">{fmtCredits(inst.credits_used)}</TableCell>
                    <TableCell className="text-right">{inst.request_count.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No usage data</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
