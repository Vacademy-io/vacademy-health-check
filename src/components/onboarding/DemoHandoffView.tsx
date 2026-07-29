import { ArrowUpRight, CheckCircle2, GraduationCap, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DemoHandoff } from "@/services/onboarding-api";

/**
 * The prospect-facing "your demo is ready" screen. Shows the admin and learner portals;
 * clicking a portal opens its login pre-filled with the shared demo credentials.
 */
export function DemoHandoffView({ handoff }: { handoff: DemoHandoff }) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          Your demo is ready
        </h1>
        <p className="mx-auto mt-2.5 max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground">
          Explore <span className="font-medium text-foreground">{handoff.displayName}</span>, a live{" "}
          {handoff.instituteTypeLabel?.toLowerCase()} workspace with real data in it. Pick a portal
          and we'll sign you in automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PortalCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Admin portal"
          subtitle="Build courses, manage learners, run campaigns — the full control room."
          username={handoff.adminUsername}
          url={handoff.adminLoginUrl}
          cta="Enter as Admin"
        />
        <PortalCard
          icon={<GraduationCap className="h-5 w-5" />}
          title="Learner portal"
          subtitle="See exactly what your learners see when they log in."
          username={handoff.learnerUsername}
          url={handoff.learnerLoginUrl}
          cta="Enter as Learner"
          variant="outline"
        />
      </div>

      <div className="mt-6 rounded-xl border border-dashed bg-muted/30 px-4 py-3 text-center">
        <p className="text-xs leading-relaxed text-muted-foreground">
          This is a shared demo workspace — click around freely, nothing here is permanent.
          <br className="hidden sm:block" /> Our team will reach out on WhatsApp shortly to set up
          your own.
        </p>
      </div>
    </div>
  );
}

function PortalCard({
  icon,
  title,
  subtitle,
  username,
  url,
  cta,
  variant,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  username?: string;
  url?: string;
  cta: string;
  variant?: "outline";
}) {
  return (
    <div className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <span className="text-base font-semibold text-foreground">{title}</span>
      </div>
      <p className="mb-4 flex-1 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
      {username && (
        <p className="mb-3 truncate text-xs text-muted-foreground">
          Signing in as <span className="font-mono font-medium text-foreground">{username}</span>
        </p>
      )}
      <Button
        className="w-full"
        variant={variant}
        disabled={!url}
        onClick={() => url && window.open(url, "_blank", "noopener")}
      >
        {cta}
        <ArrowUpRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}
