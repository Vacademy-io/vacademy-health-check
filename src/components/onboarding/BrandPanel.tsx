import {
  BadgeCheck,
  Bot,
  CreditCard,
  GraduationCap,
  Smartphone,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Numbers mirror the ones on vacademy.io — keep them in sync when the site updates. */
const STATS = [
  { value: "80+", label: "Institutes" },
  { value: "9,870+", label: "Learners" },
  { value: "788+", label: "Courses" },
];

const POINTS = [
  {
    icon: GraduationCap,
    title: "Courses, batches and live classes",
    body: "Build courses, run live classes, set exams and issue certificates — all from one place.",
  },
  {
    icon: TrendingUp,
    title: "An admissions CRM that follows up",
    body: "Capture leads from your website and ads, then let AI call and WhatsApp them until they enrol.",
  },
  {
    icon: CreditCard,
    title: "Fees, invoicing and course selling",
    body: "Collect payments online with automatic invoices, reminders and a public course catalogue.",
  },
  {
    icon: Smartphone,
    title: "Apps under your own brand",
    body: "iOS and Android for learners, a dashboard for parents, and a website builder for your site.",
  },
  {
    icon: Bot,
    title: "AI that handles the busywork",
    body: "Generate courses, quizzes and videos, and automate the workflows your team repeats daily.",
  },
];

/**
 * The marketing half of the onboarding split-screen. Purely presentational — the form never
 * depends on it, so it can be hidden on small screens without affecting the flow.
 */
export function BrandPanel({ className }: { className?: string }) {
  return (
    <aside className={cn("flex flex-col", className)}>
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        <BadgeCheck className="h-3.5 w-3.5" />
        The operating system for education businesses
      </span>

      <h2 className="mt-5 text-balance text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
        Everything you need to run your institute,{" "}
        <span className="bg-gradient-to-r from-[#ED7424] to-[#FF9B55] bg-clip-text text-transparent">
          in one place
        </span>
      </h2>

      <ul className="mt-7 space-y-5">
        {POINTS.map((p) => (
          <li key={p.title} className="flex gap-3.5">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
              <p.icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{p.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex items-center gap-6 rounded-xl border bg-card/60 px-5 py-4 backdrop-blur-sm">
        {STATS.map((s) => (
          <div key={s.label}>
            <p className="text-xl font-bold tracking-tight text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
