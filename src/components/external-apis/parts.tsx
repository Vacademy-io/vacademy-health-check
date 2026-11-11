import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { explainError, windowLabel } from "./format";

const ALL = "all";

export function ErrorNote({ title, error, onRetry }: { title: string; error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-xs">{explainError(error)}</p>
      </div>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** An empty result that says what was searched and, when it can, offers a wider one. */
export function EmptyNote({ what, hours, hint, onWiden }: {
  what: string;
  hours?: number;
  hint?: string;
  onWiden?: () => void;
}) {
  return (
    <div className="space-y-2 py-8 text-center">
      <p className="text-sm text-muted-foreground">
        {hours ? `No ${what} in ${windowLabel(hours)}.` : `No ${what}.`}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {onWiden && <Button variant="outline" size="sm" onClick={onWiden}>Show the last 30 days</Button>}
    </div>
  );
}

export function FilterSelect({ value, onChange, label, options, format }: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  label: string;
  options: string[];
  format?: (v: string) => string;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className="w-56" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: all</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{format ? format(o) : o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function Pager({ page, hasNext, onPage }: { page: number; hasNext: boolean; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-3 text-xs text-muted-foreground">
      <span>Page {page + 1}</span>
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</Button>
      <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  );
}

export function JsonBlock({ title, body, empty }: { title: string; body: string | null; empty: string }) {
  const pretty = useMemo(() => {
    if (!body) return null;
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }, [body]);
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{title}</p>
      {pretty ? (
        <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{pretty}</pre>
      ) : (
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

export interface Tile {
  label: string;
  value: string;
  note?: string | null;
  /** "warn" draws attention to a figure someone should act on. */
  tone?: "warn";
}

/** A row of headline figures at the top of a tab. */
export function Tiles({ items, loading }: { items: Tile[]; loading?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((t) => (
        <div key={t.label} className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
          {loading ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded bg-muted" />
          ) : (
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${t.tone === "warn" ? "text-amber-700 dark:text-amber-400" : ""}`}>
              {t.value}
            </p>
          )}
          {!loading && t.note && <p className="mt-1 text-xs text-muted-foreground">{t.note}</p>}
        </div>
      ))}
    </div>
  );
}

/** Plain sentences about what the numbers mean. Renders nothing when there is nothing to say. */
export function Highlights({ items, title = "What stands out" }: { items: Array<string | null | false | undefined>; title?: string }) {
  const lines = items.filter((l): l is string => !!l);
  if (!lines.length) return null;
  return (
    <div className="rounded-lg border bg-muted/40 p-4">
      <p className="mb-2 text-sm font-medium">{title}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </div>
  );
}
