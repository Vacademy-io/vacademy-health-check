import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { Button } from "@/components/ui/button";
import { SimulatePanel } from "@/components/plans/SimulatePanel";
import { usePlanSettings } from "@/services/plans-api";

/** /ai-plans/simulate?plan=&version=&institute= — replay real usage through a plan version. */
export default function PlansSimulatePage() {
  const [params] = useSearchParams();
  const settings = usePlanSettings();
  return (
    <div>
      <PageHeader
        title="Simulate an AI plan"
        description="See what a plan version would have included, paid from the allowance and charged for one institute, using its real AI usage over the last 30, 60 or 90 days."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/ai-plans">
              <ArrowLeft className="mr-1 h-4 w-4" /> All plans
            </Link>
          </Button>
        }
      />
      <SectionErrorBoundary title="Simulation">
        <SimulatePanel
          initialPlanId={params.get("plan") ?? ""}
          initialVersionId={params.get("version") ?? ""}
          initialInstituteId={params.get("institute") ?? ""}
          inrPerUsd={settings.inrPerUsd}
        />
      </SectionErrorBoundary>
    </div>
  );
}
