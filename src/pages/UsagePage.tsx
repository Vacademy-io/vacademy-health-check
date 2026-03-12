import { useState } from "react";
import { useUsageSummary } from "@/services/usage-api";
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
import { Cpu, DollarSign, Zap } from "lucide-react";
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

export default function UsagePage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useUsageSummary(days);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Usage"
        description="Platform-wide AI token usage and costs"
        actions={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)
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

        {/* Usage by day */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Usage</CardTitle>
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
                    tickFormatter={(v) => new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" })}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    labelFormatter={(v) => new Date(v).toLocaleDateString()}
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
                  <TableHead>Institute ID</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.top_institutes.map((inst) => (
                  <TableRow key={inst.institute_id}>
                    <TableCell className="font-mono text-xs">{inst.institute_id}</TableCell>
                    <TableCell className="text-right">{inst.total_tokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${Number(inst.total_cost).toFixed(4)}</TableCell>
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
