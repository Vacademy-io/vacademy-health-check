import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Activity,
  Brain,
  HeartPulse,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/institutes", label: "Institutes", icon: Building2 },
  { to: "/credits", label: "Credits", icon: CreditCard },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/usage", label: "AI Usage", icon: Brain },
  { to: "/health", label: "System Health", icon: HeartPulse },
];

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside className={cn("flex flex-col border-r bg-card", className)}>
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-lg font-semibold">Vacademy Admin</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
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
      </nav>
    </aside>
  );
}
