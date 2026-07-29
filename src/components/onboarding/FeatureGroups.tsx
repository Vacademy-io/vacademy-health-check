import { useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  Globe,
  GraduationCap,
  LayoutGrid,
  PhoneCall,
  Smartphone,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuestionOption } from "@/services/onboarding-api";

/** Icon names come from the backend catalogue; anything unmapped falls back to a neutral glyph. */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "graduation-cap": GraduationCap,
  "credit-card": CreditCard,
  "trending-up": TrendingUp,
  workflow: Workflow,
  smartphone: Smartphone,
  users: Users,
  "phone-call": PhoneCall,
  globe: Globe,
  "building-2": Building2,
};

/**
 * Capability picker: each group is a card the prospect can select, expanding to reveal the
 * individual features underneath. Selecting a card auto-opens it; selecting any feature implies
 * the group. The answer is a flat list of codes (groups and features mixed).
 */
export function FeatureGroups({
  groups,
  value,
  onChange,
}: {
  groups: QuestionOption[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState<string[]>([]);

  const has = (code: string) => value.includes(code);
  const childCodes = (g: QuestionOption) => (g.children ?? []).map((c) => c.value);
  const selectedCount = (g: QuestionOption) => childCodes(g).filter(has).length;
  const isOpen = (g: QuestionOption) => open.includes(g.value);

  const toggleGroup = (g: QuestionOption) => {
    const on = has(g.value);
    if (on) {
      // Deselecting a group clears everything inside it and collapses the card.
      const drop = new Set([g.value, ...childCodes(g)]);
      onChange(value.filter((v) => !drop.has(v)));
      setOpen((o) => o.filter((k) => k !== g.value));
    } else {
      onChange([...value, g.value]);
      setOpen((o) => (o.includes(g.value) ? o : [...o, g.value]));
    }
  };

  const toggleFeature = (g: QuestionOption, code: string) => {
    const next = has(code) ? value.filter((v) => v !== code) : [...value, code];
    // Ticking any feature implies interest in its group.
    if (!has(code) && !next.includes(g.value)) next.push(g.value);
    onChange(next);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {groups.map((g) => {
        const Icon = ICONS[g.icon ?? ""] ?? LayoutGrid;
        const active = has(g.value);
        const count = selectedCount(g);
        const expanded = isOpen(g);
        const children = g.children ?? [];

        return (
          <div
            key={g.value}
            className={cn(
              "group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all duration-200",
              active
                ? "border-primary/60 bg-primary/[0.04] shadow-sm ring-1 ring-primary/20"
                : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
            )}
          >
            <button
              type="button"
              onClick={() => toggleGroup(g)}
              aria-pressed={active}
              className="flex w-full items-start gap-3 p-4 text-left"
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{g.label}</span>
                  {count > 0 && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                      {count}
                    </span>
                  )}
                </span>
                {g.description && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {g.description}
                  </span>
                )}
              </span>

              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30 group-hover:border-primary/40"
                )}
              >
                {active && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
            </button>

            {children.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setOpen((o) =>
                      o.includes(g.value) ? o.filter((k) => k !== g.value) : [...o, g.value]
                    )
                  }
                  aria-expanded={expanded}
                  className="flex items-center gap-1 border-t border-dashed px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")}
                  />
                  {expanded ? "Hide" : `${children.length} options`}
                </button>

                <div
                  className={cn(
                    "grid transition-all duration-200 ease-out",
                    expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-1 px-4 pb-4 pt-1">
                      {children.map((c) => {
                        const on = has(c.value);
                        return (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => toggleFeature(g, c.value)}
                            aria-pressed={on}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                              on ? "text-foreground" : "text-muted-foreground hover:bg-muted/60"
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all",
                                on
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-muted-foreground/30"
                              )}
                            >
                              {on && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                            </span>
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
