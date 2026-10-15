import { useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebounced } from "@/hooks/use-debounced";
import { useInstitutes } from "@/services/institutes-api";

/**
 * Search institutes by name / email (admin-core super-admin list) and pick one. A raw id can be
 * typed too, for an institute the search does not surface.
 */
export function InstitutePicker({
  value,
  label,
  onChange,
  disabled,
}: {
  value: string;
  /** Display name of the picked institute, when known. */
  label?: string | null;
  onChange: (id: string, name: string | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 300);
  const list = useInstitutes(0, 8, q);
  const rows = q.length >= 2 ? list.data?.content ?? [] : [];
  const looksLikeId = /^[0-9a-f-]{8,64}$/i.test(query.trim());

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
        <div className="min-w-0">
          <p className="truncate font-medium">{label || value}</p>
          {label && <p className="truncate font-mono text-[11px] text-muted-foreground">{value}</p>}
        </div>
        {!disabled && (
          <button type="button" onClick={() => onChange("", null)} className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Change institute">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email, or paste an id" className="h-9 pl-8" aria-label="Find an institute" disabled={disabled} />
        {list.isFetching && q.length >= 2 && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {(rows.length > 0 || looksLikeId) && (
        <ul className="max-h-56 overflow-y-auto rounded-md border text-sm">
          {looksLikeId && (
            <li>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent" onClick={() => onChange(query.trim(), null)}>
                <Check className="h-3.5 w-3.5 text-muted-foreground" />
                Use id <span className="font-mono text-xs">{query.trim()}</span>
              </button>
            </li>
          )}
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className={cn("w-full px-3 py-2 text-left hover:bg-accent")} onClick={() => onChange(r.id, r.name)}>
                <span className="block font-medium">{r.name}</span>
                <span className="block font-mono text-[11px] text-muted-foreground">
                  {r.id}
                  {r.email ? ` · ${r.email}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.length >= 2 && !list.isFetching && rows.length === 0 && !looksLikeId && <p className="text-xs text-muted-foreground">No institute matches.</p>}
    </div>
  );
}
