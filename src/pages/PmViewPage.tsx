import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Database } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RevenueTab } from "@/components/command-center/RevenueTab";
import { AccountDrawer } from "@/components/pm/AccountDrawer";
import { AccountsTab } from "@/components/pm/AccountsTab";
import { AiCallsTab } from "@/components/pm/AiCallsTab";
import { ConversionsTab } from "@/components/pm/ConversionsTab";
import { DashboardTab } from "@/components/pm/DashboardTab";
import { TrialsTab } from "@/components/pm/TrialsTab";
import { WebAnalyticsTab } from "@/components/pm/WebAnalyticsTab";
import { usePmData } from "@/components/pm/use-pm-data";
import { QUICK_FILTERS, TRIAL_STAGE_LABEL, type QuickFilter, type TrialFilter } from "@/lib/pm-view";

const TABS = [
  { key: "dashboard", label: "Dashboard", hint: "Key numbers and what needs attention" },
  { key: "trials", label: "Trials", hint: "Accounts after the demo" },
  { key: "accounts", label: "Accounts", hint: "Every institute, with your own labels and records" },
  { key: "conversions", label: "Demo → paid", hint: "Which demo requests become paying users, by source" },
  { key: "calls", label: "AI calls", hint: "Total AI calls and which institutes make them" },
  { key: "web", label: "Web analytics", hint: "Each product's website" },
  { key: "revenue", label: "Revenue", hint: "MRR and payments" },
] as const;
type Tab = (typeof TABS)[number]["key"];
/** Tab names from the old Command Center, so saved links still land somewhere sensible. */
const OLD_TABS: Record<string, Tab> = { analytics: "web", overview: "dashboard", today: "dashboard", performance: "dashboard" };
const TRIAL_FILTERS = ["ALL", "ENDING", "DUE", ...Object.keys(TRIAL_STAGE_LABEL)];

const parseFilters = (raw: string | null): QuickFilter[] =>
  (raw ?? "").split(",").filter((f): f is QuickFilter => QUICK_FILTERS.some((q) => q.key === f && f !== "all"));

/**
 * PM View (docs/command-center/PM_View_Plan.md): the growth PM's day on one page.
 * ISOLATION: platform data is read-only here; classifications and the Customer Register are saved
 * to the separate PM store and never change platform tags, trials or subscriptions.
 * ?tab= and ?filters= keep the place in the URL.
 */
export default function PmViewPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const mapped = raw ? OLD_TABS[raw] ?? raw : null;
  const tab: Tab = TABS.some((t) => t.key === mapped) ? (mapped as Tab) : "dashboard";
  const rawStage = params.get("stage") ?? "ALL";
  const stage = (TRIAL_FILTERS.includes(rawStage) ? rawStage : "ALL") as TrialFilter;
  const filters = parseFilters(params.get("filters"));
  const [openId, setOpenId] = useState<string | null>(null);
  const data = usePmData();
  const account = openId ? data.accounts.find((a) => a.id === openId) ?? null : null;

  const go = (next: Tab, nextFilters: QuickFilter[] = filters, nextStage: TrialFilter = "ALL") => {
    const p: Record<string, string> = { tab: next };
    if (next === "accounts" && nextFilters.length) p.filters = nextFilters.join(",");
    if (next === "trials" && nextStage !== "ALL") p.stage = nextStage;
    setParams(p, { replace: true });
  };

  const body: Record<Tab, React.ReactNode> = {
    dashboard: <DashboardTab onOpenAccount={setOpenId} onOpenTrials={(s) => go("trials", [], s)} onOpenAccounts={(f) => go("accounts", f)} onOpenCalls={() => go("calls")} />,
    trials: <TrialsTab onOpenAccount={setOpenId} stage={stage} onStageChange={(s) => go("trials", [], s)} />,
    conversions: <ConversionsTab onOpenAccount={setOpenId} />,
    calls: <AiCallsTab onOpenAccount={setOpenId} />,
    accounts: <AccountsTab filters={filters} onFiltersChange={(f) => go("accounts", f)} onOpenAccount={setOpenId} />,
    web: <WebAnalyticsTab />,
    revenue: <RevenueTab />,
  };

  return (
    <div>
      <PageHeader title="PM View" description="Institutes, trials and conversions across all products. Your labels and notes here are only for you." />

      {!data.isLoading && !data.pmConfigured && (
        <div className="mb-4 flex gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <Database className="h-4 w-4 shrink-0" />
          <span>{data.pmMessage ?? "The PM store isn't connected yet, so classifications and the register can't be saved."} Everything else on this page works.</span>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => go(v as Tab, [])}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} title={t.hint}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(({ key, label }) => (
          <TabsContent key={key} value={key} className="mt-4">
            <SectionErrorBoundary title={label}>{body[key]}</SectionErrorBoundary>
          </TabsContent>
        ))}
      </Tabs>

      <AccountDrawer key={openId ?? "none"} account={account} open={!!account} onOpenChange={(o) => !o && setOpenId(null)} pmConfigured={data.pmConfigured} />
    </div>
  );
}
