import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StartTrialDialog } from "@/components/command-center/StartTrialDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsTab } from "@/components/command-center/AnalyticsTab";
import { OverviewTab } from "@/components/command-center/OverviewTab";
import { RevenueTab } from "@/components/command-center/RevenueTab";
import { TrialsPaidTab } from "@/components/command-center/TrialsPaidTab";

const TABS = [
  { key: "analytics", label: "Analytics", Body: AnalyticsTab },
  { key: "overview", label: "Overview", Body: OverviewTab },
  { key: "trials", label: "Trials & Paid", Body: TrialsPaidTab },
  { key: "revenue", label: "Revenue", Body: RevenueTab },
] as const;
type Tab = (typeof TABS)[number]["key"];

/**
 * Command Center (plan v2, Phase 1). One page, one tab per module; ?tab= keeps the open tab
 * in the URL so links and refreshes land on it. Later phases add tabs here (Funnels, Alerts).
 */
export default function CommandCenterPage() {
  const [params, setParams] = useSearchParams();
  const [starting, setStarting] = useState(false);
  const raw = params.get("tab");
  const tab: Tab = TABS.some((t) => t.key === raw) ? (raw as Tab) : "analytics";

  return (
    <div>
      <PageHeader
        title="Command Center"
        description="The portal's numbers in one place: platform, pipeline, trials, paying institutes and revenue."
        actions={
          <Button size="sm" onClick={() => setStarting(true)}>
            <Rocket className="mr-1.5 h-4 w-4" /> Start a trial
          </Button>
        }
      />
      <StartTrialDialog open={starting} onOpenChange={setStarting} />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(({ key, label, Body }) => (
          <TabsContent key={key} value={key} className="mt-4">
            <SectionErrorBoundary title={label}>
              <Body />
            </SectionErrorBoundary>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
