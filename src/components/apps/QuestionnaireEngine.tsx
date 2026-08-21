import { AlertTriangle, CornerDownRight, HelpCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FieldRenderer } from "@/components/apps/FieldRenderer";
import { questionnaireProgress, visibleQuestions } from "@/lib/app-checklist";
import type { QuestionSpec } from "@/lib/platform-requirements";
import { STORE_LABELS, type AppRecord, type Platform } from "@/types/app-registry";

interface QuestionnaireProps {
  app: AppRecord;
  platform: Platform;
  onAnswer: (questionId: string, value: string | string[]) => void;
  onField: (fieldId: string, value: string) => void;
}

/**
 * The centralised Yes/No questionnaire engine (§15).
 *
 * Questions, their follow-ups and the fields they unlock all come from the catalogue — this
 * component only knows how to draw a question and how to react when one is answered. Adding a new
 * store declaration is a row in `PLATFORM_QUESTIONS`, not a change here.
 */
export function QuestionnaireEngine({ app, platform, onAnswer, onField }: QuestionnaireProps) {
  const visible = visibleQuestions(app, platform);
  const answers = app.platforms[platform].answers;
  const fields = app.platforms[platform].fields;
  const progress = questionnaireProgress(app, platform);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{STORE_LABELS[platform]} declarations</h3>
          <p className="text-xs text-muted-foreground">
            These are the answers the store asks for during registration. Each one changes what else you must supply.
          </p>
        </div>
        <Badge variant={progress.done === progress.total ? "success" : "secondary"}>
          {progress.done} / {progress.total} answered
        </Badge>
      </div>

      <div className="space-y-3">
        {visible.map(({ spec, depth }) => (
          <QuestionCard
            key={spec.id}
            spec={spec}
            depth={depth}
            answer={answers[spec.id]}
            fieldValue={spec.unlocksField ? fields[spec.unlocksField.id] ?? "" : ""}
            onAnswer={(value) => onAnswer(spec.id, value)}
            onField={onField}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionCard({
  spec,
  depth,
  answer,
  fieldValue,
  onAnswer,
  onField,
}: {
  spec: QuestionSpec;
  depth: number;
  answer: string | string[] | undefined;
  fieldValue: string;
  onAnswer: (value: string | string[]) => void;
  onField: (fieldId: string, value: string) => void;
}) {
  const answered = Array.isArray(answer) ? answer.length > 0 : Boolean(answer);
  const note = spec.noteOnAnswer && answer === spec.noteOnAnswer.whenAnswer ? spec.noteOnAnswer.text : null;
  const showUnlocked = spec.unlocksField && answer === "YES";

  return (
    <Card
      // Follow-ups are indented and hairline-marked so it stays obvious which answer produced them.
      className={cn(depth > 0 && "ml-0 border-l-4 border-l-primary/30 md:ml-6", !answered && "border-dashed")}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          {depth > 0 && <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{spec.question}</p>
            <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <HelpCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{spec.why}</span>
            </p>
          </div>
        </div>

        {spec.type === "YES_NO" ? (
          <div className="flex gap-2">
            {["YES", "NO"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onAnswer(option)}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:min-w-24",
                  answer === option
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {option === "YES" ? "Yes" : "No"}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(spec.options ?? []).map((option) => {
              const selected = Array.isArray(answer) && answer.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    const current = Array.isArray(answer) ? answer : [];
                    onAnswer(selected ? current.filter((v) => v !== option) : [...current, option]);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}

        {note && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>{note}</span>
          </div>
        )}

        {showUnlocked && spec.unlocksField && (
          <div className="rounded-md border bg-muted/30 p-3">
            <FieldRenderer
              spec={spec.unlocksField}
              value={fieldValue}
              onChange={(value) => onField(spec.unlocksField!.id, value)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
