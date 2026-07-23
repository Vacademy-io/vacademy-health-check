import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Brain,
  CalendarClock,
  CreditCard,
  GraduationCap,
  MonitorPlay,
  UserPlus,
  Wallet,
} from "lucide-react";
import api from "@/lib/axios";
import {
  useActiveNow,
  useActiveSparkline,
  useAiBurnToday,
  useAiChatToday,
  useAttemptsToday,
  useGrowthToday,
  useLearningActivity,
  useLiveClassesToday,
  usePaymentsToday,
} from "@/services/pulse-api";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LeadTag } from "@/lib/constants";

// Institute id -> { name, lead_tag } map, fetched once via the SQL proxy so we
// can label per-institute rows and filter out TEST/LEAD workspaces client-side.
interface InstituteMetaRow {
  id: string;
  name: string | null;
  lead_tag: LeadTag | null;
}

function useInstituteMeta() {
  return useQuery({
    queryKey: ["pulse", "institute-meta"],
    queryFn: async () => {
      const { data } = await api.post<{ rows: InstituteMetaRow[] }>("/analytics-api/query", {
        db: "admin_core_service",
        sql: "SELECT id::text AS id, name, lead_tag FROM institutes",
      });
      return new Map(data.rows.map((r) => [r.id, r]));
    },
    staleTime: 10 * 60_000,
  });
}

const EXCLUDED_TAGS: ReadonlyArray<string> = ["TEST", "LEAD"];

export default function PulsePage() {
  const [realOnly, setRealOnly] = useState(true);

  const meta = useInstituteMeta();
  const activeNow = useActiveNow();
  const sparkline = useActiveSparkline();
  const aiChat = useAiChatToday();
  const liveClasses = useLiveClassesToday();
  const learning = useLearningActivity();
  const attempts = useAttemptsToday();
  const growth = useGrowthToday();
  const payments = usePaymentsToday();
  const aiBurn = useAiBurnToday();

  const isRealInstitute = useMemo(() => {
    const map = meta.data;
    return (instituteId: string | null) => {
      if (!realOnly) return true;
      if (!instituteId) return true; // unattributed activity stays visible
      const tag = map?.get(instituteId)?.lead_tag;
      return !tag || !EXCLUDED_TAGS.includes(tag);
    };
  }, [meta.data, realOnly]);

  const instituteName = (id: string | null) =>
    (id && meta.data?.get(id)?.name) || (id ? `${id.slice(0, 8)}…` : "Unattributed");

  const activeRows = useMemo(
    () => (activeNow.data ?? []).filter((r) => isRealInstitute(r.institute_id)),
    [activeNow.data, isRealInstitute],
  );
  const activeTotal = activeRows.reduce((sum, r) => sum + r.users, 0);

  const aiChatRows = useMemo(
    () => (aiChat.data ?? []).filter((r) => isRealInstitute(r.institute_id)),
    [aiChat.data, isRealInstitute],
  );
  const aiQuestions = aiChatRows.reduce((sum, r) => sum + r.questions, 0);
  const aiSessions = aiChatRows.reduce((sum, r) => sum + r.sessions, 0);

  const totalCredits = (aiBurn.data ?? []).reduce((sum, r) => sum + r.credits, 0);

  const loadingTiles = activeNow.isLoading || learning.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Live Pulse"
          description="Real-time product usage across the platform — read from the prod DB standby"
        />
        <div className="flex items-center gap-2 pt-1">
          <input
            id="real-only"
            type="checkbox"
            checked={realOnly}
            onChange={(e) => setRealOnly(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <Label htmlFor="real-only" className="text-sm text-muted-foreground">
            Hide test institutes
          </Label>
        </div>
      </div>

      {/* Row 1 — headline tiles (24h window unless marked) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loadingTiles ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard
              title="Active Users Now"
              value={activeTotal}
              description="last 15 minutes"
              icon={Activity}
            />
            <StatCard
              title="AI Questions Today"
              value={aiQuestions}
              description={`${aiSessions} chat sessions`}
              icon={Brain}
            />
            <StatCard
              title="Live Classes"
              value={liveClasses.data?.live_now ?? 0}
              description={`${liveClasses.data?.scheduled_today ?? 0} scheduled today`}
              icon={MonitorPlay}
            />
            <StatCard
              title="Learning Minutes"
              value={learning.data?.engaged_minutes ?? 0}
              description={`${learning.data?.learners_learning ?? 0} learners active`}
              icon={GraduationCap}
            />
            <StatCard
              title="Assessment Attempts"
              value={attempts.data?.attempts ?? 0}
              description={`${attempts.data?.students ?? 0} unique students`}
              icon={CalendarClock}
            />
            <StatCard
              title="New Leads"
              value={growth.data?.new_leads ?? 0}
              description={`${growth.data?.new_enrollments ?? 0} new enrollments`}
              icon={UserPlus}
            />
            <StatCard
              title="Payments Today"
              value={payments.data?.paid_count ?? 0}
              description={`₹${Number(payments.data?.paid_amount ?? 0).toLocaleString()} collected · ${
                payments.data?.pending_count ?? 0
              } pending · ${payments.data?.failed_count ?? 0} failed`}
              icon={Wallet}
            />
            <StatCard
              title="AI Credits Burned"
              value={Math.round(totalCredits * 10) / 10}
              description="last 24 hours"
              icon={CreditCard}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Hourly active users (24h) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Unique Active Users per Hour (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            {sparkline.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : sparkline.data?.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={sparkline.data}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) =>
                      new Date(v).toLocaleTimeString("en", { hour: "numeric", hour12: true })
                    }
                  />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    labelFormatter={(v) => new Date(v).toLocaleString()}
                  />
                  <Area
                    type="monotone"
                    dataKey="users"
                    name="Unique users"
                    stroke="hsl(var(--chart-2))"
                    fill="hsl(var(--chart-2))"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No activity data</p>
            )}
          </CardContent>
        </Card>

        {/* Active users by institute */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Active by Institute
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeNow.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : activeRows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institute</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeRows.slice(0, 12).map((row) => (
                    <TableRow key={row.institute_id ?? "none"}>
                      <TableCell className="max-w-[180px] truncate text-xs">
                        {instituteName(row.institute_id)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{row.users}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">Nobody active in the last 15 minutes</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* AI credit burn by feature */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">AI Usage by Feature (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            {aiBurn.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : aiBurn.data?.length ? (
              <ResponsiveContainer width="100%" height={Math.max(220, aiBurn.data.length * 36)}>
                <BarChart data={aiBurn.data} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="request_type"
                    width={110}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar
                    dataKey="requests"
                    name="Requests"
                    fill="hsl(var(--chart-2))"
                    radius={[0, 4, 4, 0]}
                    barSize={14}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No AI usage in the last 24h</p>
            )}
          </CardContent>
        </Card>

        {/* AI questions by institute */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4" />
              AI Questions by Institute
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aiChat.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : aiChatRows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institute</TableHead>
                    <TableHead className="text-right">Questions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aiChatRows
                    .filter((r) => r.questions > 0)
                    .slice(0, 12)
                    .map((row) => (
                      <TableRow key={row.institute_id ?? "none"}>
                        <TableCell className="max-w-[180px] truncate text-xs">
                          {instituteName(row.institute_id)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{row.questions}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No AI questions in the last 24h</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Content consumption strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Video Events (24h)"
          value={learning.data?.video_events ?? 0}
          icon={MonitorPlay}
        />
        <StatCard
          title="Document Events (24h)"
          value={learning.data?.doc_events ?? 0}
          icon={GraduationCap}
        />
        <StatCard
          title="Chat Sessions (24h)"
          value={aiSessions}
          icon={Brain}
        />
      </div>
    </div>
  );
}
