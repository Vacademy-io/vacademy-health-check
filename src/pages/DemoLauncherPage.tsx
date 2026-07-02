import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DemoHandoffView } from "@/components/onboarding/DemoHandoffView";
import {
  fetchPublicLink,
  fetchDirectDemo,
  type DemoHandoff,
  type QuestionOption,
} from "@/services/onboarding-api";

const DEFAULT_TYPES: QuestionOption[] = [
  { value: "SCHOOL", label: "School" },
  { value: "DISTANCE_LEARNING", label: "Distance Learning" },
  { value: "CORPORATE", label: "Corporate" },
  { value: "UNIVERSITY", label: "University" },
];

export default function DemoLauncherPage() {
  const { slug } = useParams();
  const { data: config } = useQuery({
    queryKey: ["onboarding", "public-link", slug],
    queryFn: () => fetchPublicLink(slug!),
    enabled: !!slug,
    retry: false,
  });

  const [handoff, setHandoff] = useState<DemoHandoff | null>(null);
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const launch = async (type: string) => {
    setLoadingType(type);
    setError(null);
    try {
      setHandoff(await fetchDirectDemo(type));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not launch demo.");
    } finally {
      setLoadingType(null);
    }
  };

  // Auto-launch when the link forces a single type.
  useEffect(() => {
    if (config?.forcedInstituteType && !handoff) {
      void launch(config.forcedInstituteType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.forcedInstituteType]);

  const types = config?.instituteTypes?.length ? config.instituteTypes : DEFAULT_TYPES;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-muted/40 to-background px-4 py-12">
      {handoff ? (
        <DemoHandoffView handoff={handoff} />
      ) : config?.forcedInstituteType ? (
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      ) : (
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Pick a demo to explore</h1>
            <p className="mt-2 text-muted-foreground">
              Choose the workspace closest to your organization and we'll drop you straight in.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {types.map((t) => (
              <button
                key={t.value}
                type="button"
                disabled={!!loadingType}
                onClick={() => launch(t.value)}
                className={cn(
                  "flex items-center justify-between rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:border-primary hover:shadow-md disabled:opacity-60"
                )}
              >
                <div>
                  <p className="text-base font-semibold">{t.label}</p>
                  <p className="text-sm text-muted-foreground">Launch the {t.label.toLowerCase()} demo</p>
                </div>
                {loadingType === t.value ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <PlayCircle className="h-5 w-5 text-primary" />
                )}
              </button>
            ))}
          </div>
          {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
