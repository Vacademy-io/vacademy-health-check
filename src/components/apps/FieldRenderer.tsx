import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { FieldSpec } from "@/lib/platform-requirements";

interface FieldRendererProps {
  spec: FieldSpec;
  value: string;
  onChange: (value: string) => void;
  /** Shown in red under the field — validation the user must fix before submitting. */
  error?: string;
}

/**
 * One catalogue field, rendered. Every store field in the module goes through here, so the
 * character counters, help text and required markers behave identically everywhere.
 */
export function FieldRenderer({ spec, value, onChange, error }: FieldRendererProps) {
  const overLimit = spec.maxLength != null && value.length > spec.maxLength;

  return (
    <div className={cn("space-y-1.5", spec.span === "full" && "md:col-span-2")}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={spec.id} className="text-sm">
          {spec.label}
          {spec.required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        {spec.maxLength != null && (
          <span className={cn("text-[11px] tabular-nums", overLimit ? "font-medium text-destructive" : "text-muted-foreground")}>
            {value.length}/{spec.maxLength}
          </span>
        )}
      </div>

      {spec.type === "textarea" ? (
        <Textarea
          id={spec.id}
          value={value}
          placeholder={spec.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn("min-h-24", overLimit && "border-destructive")}
        />
      ) : spec.type === "select" ? (
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger id={spec.id}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {(spec.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={spec.id}
          type={spec.type === "number" ? "number" : spec.type === "email" ? "email" : "text"}
          value={value}
          placeholder={spec.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(overLimit && "border-destructive")}
        />
      )}

      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : spec.helpText ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{spec.helpText}</p>
      ) : null}
    </div>
  );
}

/** Two-column grid of catalogue fields. `span: "full"` rows stretch across both columns. */
export function FieldGrid({
  specs,
  values,
  onChange,
  errors,
}: {
  specs: FieldSpec[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  errors?: Record<string, string>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {specs.map((spec) => (
        <FieldRenderer
          key={spec.id}
          spec={spec}
          value={values[spec.id] ?? ""}
          onChange={(value) => onChange(spec.id, value)}
          error={errors?.[spec.id]}
        />
      ))}
    </div>
  );
}
