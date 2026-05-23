import { useVimotionStats } from "@/services/vimotion-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Mail,
  CheckCircle2,
  XCircle,
  KeyRound,
  Ban,
  TrendingUp,
  Sparkles,
} from "lucide-react";

export default function VimotionStatsPage() {
  const { data, isLoading } = useVimotionStats();

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Vimotion Stats"
          description="Funnel + top referrers across the launch."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const conversionPct = (data.conversion_rate * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vimotion Stats"
        description="Funnel + top referrers across the launch."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Waitlist
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard title="Total" value={data.waitlist_total} icon={Users} />
          <StatCard title="Pending" value={data.waitlist_pending} icon={Mail} />
          <StatCard title="Invited" value={data.waitlist_invited} icon={Sparkles} />
          <StatCard title="Converted" value={data.waitlist_converted} icon={CheckCircle2} />
          <StatCard title="Rejected" value={data.waitlist_rejected} icon={XCircle} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Invite codes
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Active" value={data.invites_active} icon={KeyRound} />
          <StatCard title="Exhausted" value={data.invites_exhausted} icon={CheckCircle2} />
          <StatCard title="Revoked" value={data.invites_revoked} icon={Ban} />
          <StatCard
            title="Conversion rate"
            value={`${conversionPct}%`}
            icon={TrendingUp}
            description={`${data.waitlist_converted} of ${data.waitlist_total} converted`}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Top referrers
        </h2>
        <Card>
          <CardContent className="p-0">
            {data.top_referrers.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No referrals yet. Once people start sharing their waitlist links, the top movers
                show up here.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Code</th>
                    <th className="px-4 py-3 text-right font-medium">Referrals</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_referrers.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-4 py-3">{r.full_name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.referral_code}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {r.referral_count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
