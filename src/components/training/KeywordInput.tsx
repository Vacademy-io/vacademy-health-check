import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Chips input: Enter or comma adds, Backspace on empty removes the last, pasted lists split on , ; or new lines. */
export function KeywordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const incoming = raw
      .split(/[,;\n]/)
      .map((k) => k.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    if (!incoming.length) return;
    const next = [...value];
    for (const k of incoming) if (!next.some((v) => v.toLowerCase() === k.toLowerCase())) next.push(k);
    onChange(next);
    setDraft("");
  };

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring">
      {value.map((k) => (
        <span key={k} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary">
          {k}
          <button
            type="button"
            aria-label={`Remove ${k}`}
            onClick={() => onChange(value.filter((v) => v !== k))}
            className="rounded-full p-0.5 hover:bg-primary/20"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Input
        value={draft}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,;\n]/.test(v)) add(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/[,;\n]/.test(text)) {
            e.preventDefault();
            add(draft + text);
          }
        }}
        className="h-7 min-w-[10rem] flex-1 border-0 px-1.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}
