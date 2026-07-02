import { ArrowUpRight, GraduationCap, ShieldCheck, Sparkles } from "lucide-react";
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
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Your demo is ready</h1>
        <p className="mt-2 text-muted-foreground">
          Explore <span className="font-medium text-foreground">{handoff.displayName}</span> — a live{" "}
          {handoff.instituteTypeLabel.toLowerCase()} workspace. Pick a portal to jump in; we'll sign
          you in automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PortalCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Admin portal"
          subtitle="Build courses, manage learners, configure everything."
          username={handoff.adminUsername}
          url={handoff.adminLoginUrl}
          cta="Enter as Admin"
        />
        <PortalCard
          icon={<GraduationCap className="h-5 w-5" />}
          title="Learner portal"
          subtitle="See exactly what your learners experience."
          username={handoff.learnerUsername}
          url={handoff.learnerLoginUrl}
          cta="Enter as Learner"
        />
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        This is a shared demo workspace. Feel free to click around — nothing here is permanent.
      </p>
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
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  username?: string;
  url?: string;
  cta: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-center gap-2 text-primary">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">{icon}</div>
        <span className="text-base font-semibold text-foreground">{title}</span>
      </div>
      <p className="mb-4 flex-1 text-sm text-muted-foreground">{subtitle}</p>
      {username && (
        <p className="mb-3 text-xs text-muted-foreground">
          Signing in as <span className="font-mono font-medium text-foreground">{username}</span>
        </p>
      )}
      <Button
        className="w-full"
        disabled={!url}
        onClick={() => url && window.open(url, "_blank", "noopener")}
      >
        {cta}
        <ArrowUpRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}
