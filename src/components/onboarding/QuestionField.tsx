import { Check, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Question } from "@/services/onboarding-api";
import { FeatureGroups } from "./FeatureGroups";
import { PhoneField } from "./PhoneField";

type Value = unknown;

/** Shared input chrome so every text-ish field reads as one system. */
const inputClass = (invalid?: boolean) =>
  cn(
    "w-full rounded-lg border bg-white/80 px-3 py-2 text-sm shadow-sm transition-all",
    "placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30",
    "dark:bg-slate-900/60",
    invalid ? "border-red-400 focus:border-red-400" : "border-input focus:border-primary"
  );

export function QuestionField({
  question,
  value,
  error,
  onChange,
}: {
  question: Question;
  value: Value;
  error?: string;
  onChange: (v: Value) => void;
}) {
  const id = `q-${question.key}`;
  const invalid = Boolean(error);

  const label = (
    <Label htmlFor={id} className="text-sm font-medium text-foreground">
      {question.label}
      {question.required && <span className="ml-0.5 text-primary">*</span>}
    </Label>
  );

  const help = question.helpText && !error && (
    <p className="text-xs leading-relaxed text-muted-foreground">{question.helpText}</p>
  );

  const errorNote = error && (
    <p className="flex items-center gap-1 text-xs font-medium text-red-600">
      <X className="h-3 w-3" strokeWidth={3} />
      {error}
    </p>
  );

  const wrap = (children: React.ReactNode) => (
    <div className="space-y-2">
      {label}
      {children}
      {errorNote}
      {help}
    </div>
  );

  switch (question.type) {
    case "FEATURE_GROUPS":
      return wrap(
        <FeatureGroups
          groups={question.options ?? []}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
        />
      );

    case "PHONE":
      return wrap(
        <PhoneField
          id={id}
          value={(value as string) ?? ""}
          placeholder={question.placeholder}
          invalid={invalid}
          onChange={onChange}
        />
      );

    case "TEXTAREA":
      return wrap(
        <textarea
          id={id}
          rows={3}
          placeholder={question.placeholder}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass(invalid), "resize-y leading-relaxed")}
        />
      );

    case "BOOLEAN":
      return wrap(
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: true, l: "Yes" },
            { v: false, l: "No" },
          ].map((opt) => {
            const on = value === opt.v;
            return (
              <button
                key={opt.l}
                type="button"
                onClick={() => onChange(opt.v)}
                aria-pressed={on}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                  on
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-input bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                {opt.l}
              </button>
            );
          })}
        </div>
      );

    case "SELECT": {
      // Short option sets read better (and tap better) as pills than as a dropdown.
      const options = question.options ?? [];
      if (options.length > 0 && options.length <= 6) {
        return wrap(
          <div className="flex flex-wrap gap-2">
            {options.map((o) => {
              const on = value === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onChange(o.value)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm transition-all",
                    on
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-input bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        );
      }
      return wrap(
        <Select value={(value as string) ?? ""} onValueChange={(v) => onChange(v)}>
          <SelectTrigger id={id} className={cn(invalid && "border-red-400")}>
            <SelectValue placeholder={question.placeholder ?? "Select…"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    case "MULTISELECT": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) =>
        onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
      return wrap(
        <div className="flex flex-wrap gap-2">
          {question.options?.map((o) => {
            const on = arr.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                aria-pressed={on}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-all",
                  on
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-input bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }

    case "COLOR":
      return wrap(
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg border shadow-sm">
            <input
              id={id}
              type="color"
              value={(value as string) || "#4f46e5"}
              onChange={(e) => onChange(e.target.value)}
              className="absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] cursor-pointer border-0 p-0"
            />
          </div>
          <input
            value={(value as string) ?? ""}
            placeholder="#4f46e5"
            onChange={(e) => onChange(e.target.value)}
            className={cn(inputClass(invalid), "max-w-[160px] font-mono tabular-nums")}
          />
        </div>
      );

    default: {
      const inputType =
        question.type === "EMAIL" ? "email" : question.type === "URL" ? "url" : "text";
      const autoComplete =
        question.type === "EMAIL"
          ? "email"
          : question.key === "full_name"
            ? "name"
            : question.key === "organization_name"
              ? "organization"
              : undefined;
      return wrap(
        <input
          id={id}
          type={inputType}
          autoComplete={autoComplete}
          placeholder={question.placeholder}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass(invalid)}
        />
      );
    }
  }
}
