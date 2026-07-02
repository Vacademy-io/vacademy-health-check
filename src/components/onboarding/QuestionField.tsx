import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Question } from "@/services/onboarding-api";

type Value = unknown;

export function QuestionField({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: Value;
  onChange: (v: Value) => void;
}) {
  const id = `q-${question.key}`;
  const label = (
    <Label htmlFor={id} className="text-sm font-medium">
      {question.label}
      {question.required && <span className="ml-0.5 text-red-500">*</span>}
    </Label>
  );
  const help = question.helpText && (
    <p className="text-xs text-muted-foreground">{question.helpText}</p>
  );

  switch (question.type) {
    case "TEXTAREA":
      return (
        <div className="space-y-1.5">
          {label}
          <Textarea
            id={id}
            placeholder={question.placeholder}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
          />
          {help}
        </div>
      );

    case "BOOLEAN":
      return (
        <div className="space-y-1.5">
          {label}
          <div className="flex gap-2">
            {[
              { v: true, l: "Yes" },
              { v: false, l: "No" },
            ].map((opt) => (
              <button
                key={opt.l}
                type="button"
                onClick={() => onChange(opt.v)}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  value === opt.v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-accent"
                )}
              >
                {opt.l}
              </button>
            ))}
          </div>
          {help}
        </div>
      );

    case "SELECT":
      return (
        <div className="space-y-1.5">
          {label}
          <Select
            value={(value as string) ?? ""}
            onValueChange={(v) => onChange(v)}
          >
            <SelectTrigger id={id}>
              <SelectValue placeholder={question.placeholder ?? "Select…"} />
            </SelectTrigger>
            <SelectContent>
              {question.options?.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {help}
        </div>
      );

    case "MULTISELECT": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) =>
        onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
      return (
        <div className="space-y-1.5">
          {label}
          <div className="flex flex-wrap gap-2">
            {question.options?.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  arr.includes(o.value)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-accent"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {help}
        </div>
      );
    }

    case "COLOR":
      return (
        <div className="space-y-1.5">
          {label}
          <div className="flex items-center gap-3">
            <input
              id={id}
              type="color"
              value={(value as string) || "#4f46e5"}
              onChange={(e) => onChange(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border bg-card"
            />
            <Input
              value={(value as string) ?? ""}
              placeholder="#4f46e5"
              onChange={(e) => onChange(e.target.value)}
              className="max-w-[160px]"
            />
          </div>
          {help}
        </div>
      );

    default: {
      const inputType =
        question.type === "EMAIL"
          ? "email"
          : question.type === "PHONE"
            ? "tel"
            : question.type === "URL"
              ? "url"
              : "text";
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={id}
            type={inputType}
            placeholder={question.placeholder}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {help}
        </div>
      );
    }
  }
}
