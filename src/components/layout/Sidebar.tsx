import { NavLink } from "react-router-dom";
import {
  PhoneCall,
  LayoutDashboard,
  Building2,
  CreditCard,
  Activity,
  Brain,
  HeartPulse,
  Timer,
  Gauge,
  Sparkles,
  KeyRound,
  TrendingUp,
  Megaphone,
  FolderSearch,
  UploadCloud,
  LifeBuoy,
  Settings2,
  Rocket,
  Radio,
  KanbanSquare,
  BookOpen,
  Milestone,
  AppWindow,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navSections: Array<{
  label?: string;
  items: Array<{ to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }>;
}> = [
  {
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/pulse", label: "Live Pulse", icon: Gauge },
      { to: "/institutes", label: "Institutes", icon: Building2 },
      { to: "/credits", label: "Credits", icon: CreditCard },
      { to: "/activity", label: "Activity", icon: Activity },
      { to: "/usage", label: "AI Usage", icon: Brain },
      { to: "/ai-settings", label: "AI Settings", icon: SlidersHorizontal },
      { to: "/calls", label: "Calls", icon: PhoneCall },
      { to: "/performance", label: "Experienced Perf", icon: Timer },
      { to: "/health", label: "System Health", icon: HeartPulse },
      { to: "/admin/status", label: "Status", icon: Megaphone },
      { to: "/broadcasts", label: "Broadcasts", icon: Radio },
    ],
  },
  {
    label: "App Stores",
    items: [{ to: "/apps", label: "App Registration", icon: AppWindow }],
  },
  {
    label: "Support",
    items: [
      { to: "/support", label: "Inbox", icon: LifeBuoy, end: true },
      { to: "/support/board", label: "Board", icon: KanbanSquare },
      { to: "/support/settings", label: "Settings", icon: Settings2 },
    ],
  },
  {
    label: "Onboarding",
    items: [{ to: "/onboarding", label: "Onboarding & Demos", icon: Rocket }],
  },
  {
    label: "Help",
    items: [
      { to: "/guides", label: "Guides", icon: BookOpen },
      { to: "/roadmap", label: "Roadmap", icon: Milestone },
    ],
  },
  {
    label: "Media",
    items: [
      { to: "/files", label: "Files", icon: FolderSearch, end: true },
      { to: "/files/upload", label: "Upload File", icon: UploadCloud },
    ],
  },
  {
    label: "Vimotion",
    items: [
      { to: "/vimotion/waitlist", label: "Waitlist", icon: Sparkles },
      { to: "/vimotion/invite-codes", label: "Invite Codes", icon: KeyRound },
      { to: "/vimotion/stats", label: "Stats", icon: TrendingUp },
    ],
  },
];

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside className={cn("flex flex-col border-r bg-card", className)}>
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-lg font-semibold">Vacademy Admin</span>
      </div>
      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2">
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            {section.label && (
              <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </p>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
