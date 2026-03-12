import { useState } from "react";
import { useActiveUsers, useActivityTrends } from "@/services/dashboard-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Activity, Globe } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export default function ActivityPage() {
  const [days, setDays] = useState(30);
  const activeUsers = useActiveUsers();
  const trends = useActivityTrends(days);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Activity"
        description="User activity trends and real-time active users"
        actions={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {trends.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard title="Unique Users" value={trends.data?.total_unique_users ?? 0} icon={Users} />
            <StatCard title="Total Sessions" value={trends.data?.total_sessions ?? 0} icon={Activity} />
            <StatCard title="API Calls" value={trends.data?.total_api_calls ?? 0} icon={Globe} />
          </>
        )}
      </div>

      {/* Trends chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Activity ({days} days)</CardTitle>
        </CardHeader>
        <CardContent>
          {trends.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : trends.data?.daily_trends?.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={trends.data.daily_trends}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" })
                  }
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  labelFormatter={(v) => new Date(v).toLocaleDateString()}
                />
                <Legend />
                <Line type="monotone" dataKey="unique_users" name="Unique Users" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total_sessions" name="Sessions" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total_api_calls" name="API Calls" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">No trend data</p>
          )}
        </CardContent>
      </Card>

      {/* Active users */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Currently Active Users: {activeUsers.data?.total_currently_active ?? 0}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeUsers.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : activeUsers.data?.per_institute?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Institute ID</TableHead>
                  <TableHead className="text-right">Active Users</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeUsers.data.per_institute.map((inst) => (
                  <TableRow key={inst.institute_id}>
                    <TableCell className="font-mono text-xs">{inst.institute_id}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{inst.active_count}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No active sessions</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
