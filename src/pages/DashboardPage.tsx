import { Building2, Users, BookOpen, Layers, TrendingUp, UserPlus, Activity } from "lucide-react";
import { usePlatformDashboard, useActiveUsers, useActivityTrends } from "@/services/dashboard-api";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function DashboardPage() {
  const dashboard = usePlatformDashboard();
  const activeUsers = useActiveUsers();
  const trends = useActivityTrends(7);

  const d = dashboard.data;
  const isLoading = dashboard.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader title="Platform Dashboard" description="Overview of all institutes and platform activity" />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard title="Total Institutes" value={d?.total_institutes ?? 0} icon={Building2} />
            <StatCard title="Total Students" value={d?.total_students ?? 0} icon={Users} />
            <StatCard title="Total Courses" value={d?.total_courses ?? 0} icon={BookOpen} />
            <StatCard title="Total Batches" value={d?.total_batches ?? 0} icon={Layers} />
            <StatCard
              title="New Institutes (This Month)"
              value={d?.institutes_created_this_month ?? 0}
              icon={TrendingUp}
            />
            <StatCard
              title="New Students (This Month)"
              value={d?.students_enrolled_this_month ?? 0}
              icon={UserPlus}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Activity trends chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Activity Trends (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {trends.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : trends.data?.daily_trends?.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trends.data.daily_trends}>
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
                  <Line
                    type="monotone"
                    dataKey="unique_users"
                    name="Unique Users"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="total_sessions"
                    name="Sessions"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="total_api_calls"
                    name="API Calls"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No trend data available</p>
            )}
          </CardContent>
        </Card>

        {/* Active users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Active Users Now
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeUsers.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <>
                <p className="mb-4 text-3xl font-bold">
                  {activeUsers.data?.total_currently_active ?? 0}
                </p>
                {activeUsers.data?.per_institute?.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Institute</TableHead>
                        <TableHead className="text-right">Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeUsers.data.per_institute.slice(0, 10).map((inst) => (
                        <TableRow key={inst.institute_id}>
                          <TableCell className="max-w-[140px] truncate text-xs">
                            {inst.institute_id}
                          </TableCell>
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
