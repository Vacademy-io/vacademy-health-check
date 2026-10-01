import { ToastStack, useToasts } from "@/components/shared/Toast";
import { SectionErrorBoundary } from "@/components/shared/SectionErrorBoundary";
import { RateCardSection } from "./RateCardSection";
import { EvaluationApiPanel } from "./EvaluationApiPanel";

/** InstituteDetailPage → "Pricing & API": contract prices and Evaluation API access (spec §10.7). */
export function PricingApiTab({ instituteId }: { instituteId: string }) {
  const { toasts, push, dismiss } = useToasts();
  const notify = (text: string) => push("success", text);
  return (
    <div className="space-y-6">
      <SectionErrorBoundary title="Rate card">
        <RateCardSection instituteId={instituteId} onNotify={notify} />
      </SectionErrorBoundary>
      <SectionErrorBoundary title="Evaluation API">
        <EvaluationApiPanel instituteId={instituteId} onNotify={notify} />
      </SectionErrorBoundary>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
