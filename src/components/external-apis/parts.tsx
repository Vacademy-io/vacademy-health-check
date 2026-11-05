import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorText } from "./format";

const ALL = "all";

export function ErrorNote({ title, error }: { title: string; error: unknown }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs">{errorText(error)}</p>
      </div>
    </div>
  );
}

export function FilterSelect({ value, onChange, label, options }: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  label: string;
  options: string[];
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger className="w-56" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: all</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
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
