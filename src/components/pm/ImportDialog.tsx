import { useMemo, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PmRecord } from "@/lib/pm-record";
import { planImport, registerTemplateCsv, type ImportRow } from "@/lib/pm-view";
import type { InstituteListItemDTO } from "@/types/api";
import { useBulkPmRecords } from "@/services/pm-api";
import { downloadText } from "./use-pm-data";

const STATUS_STYLE: Record<ImportRow["status"], string> = {
  new: "text-emerald-700 dark:text-emerald-400",
  update: "text-sky-700 dark:text-sky-400",
  unchanged: "text-muted-foreground",
  unmatched: "text-amber-700 dark:text-amber-400",
  error: "text-destructive",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutes: InstituteListItemDTO[];
  records: Map<string, PmRecord>;
  pmConfigured: boolean;
}

/** Bulk upload into the PM register: preview every row, then save only the valid ones (PM store only). */
export function ImportDialog({ open, onOpenChange, institutes, records, pmConfigured }: Props) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const bulk = useBulkPmRecords();
  const plan = useMemo(() => (text ? planImport(text, institutes, records) : null), [text, institutes, records]);
  const toSave = plan?.rows.filter((r) => r.status === "new" || r.status === "update") ?? [];
  const counts = (plan?.rows ?? []).reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});

  const reset = () => {
    setText("");
    setFileName("");
    setDone(null);
    bulk.reset();
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setDone(null);
    setFileName(f.name);
    setText(await f.text());
  };

  const onSave = () =>
    bulk.mutate(
      toSave.map((r) => r.patch),
      { onSuccess: (res) => setDone(`Saved ${res.saved} record${res.saved === 1 ? "" : "s"} to the PM register.${res.skipped ? ` ${res.skipped} skipped.` : ""} Platform data wasn't changed.`) }
    );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload to the Customer Register</DialogTitle>
          <DialogDescription>
            CSV with one row per institute. Rows are matched by institute ID, then subdomain, institute email or exact name. Empty cells keep what's already saved. This only updates the PM
            register; the platform isn't changed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadText("customer-register-template.csv", registerTemplateCsv())}>
            <Download className="mr-1.5 h-4 w-4" /> Download template
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            <Upload className="mr-1.5 h-4 w-4" /> {fileName || "Choose CSV file"}
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <span className="text-xs text-muted-foreground">Tip: export the register, edit it in Excel or Sheets, and upload it again.</span>
        </div>

        {plan && (
          <div className="space-y-3">
            <p className="text-sm">
              {plan.rows.length} rows · <span className={STATUS_STYLE.new}>{counts.new ?? 0} new</span> · <span className={STATUS_STYLE.update}>{counts.update ?? 0} updates</span> ·{" "}
              <span className={STATUS_STYLE.unchanged}>{counts.unchanged ?? 0} unchanged</span> · <span className={STATUS_STYLE.unmatched}>{counts.unmatched ?? 0} not matched</span> ·{" "}
              <span className={STATUS_STYLE.error}>{counts.error ?? 0} with errors</span>
            </p>
            {plan.unknownColumns.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">Ignored columns: {plan.unknownColumns.join(", ")}</p>}
            <div className="max-h-80 overflow-y-auto rounded border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Row</th>
                    <th className="px-2 py-1.5 text-left">Institute</th>
                    <th className="px-2 py-1.5 text-left">Matched by</th>
                    <th className="px-2 py-1.5 text-left">Result</th>
                    <th className="px-2 py-1.5 text-left">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.rowNo} className="border-t align-top">
                      <td className="px-2 py-1 tabular-nums">{r.rowNo}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1 text-muted-foreground">{r.matchedBy ?? "—"}</td>
                      <td className={cn("px-2 py-1 font-medium", STATUS_STYLE[r.status])}>{r.status}</td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {r.errors.length ? r.errors.join("; ") : r.status === "unmatched" ? "No institute found; add its ID or subdomain" : r.changedFields.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onSave} disabled={!pmConfigured || toSave.length === 0 || bulk.isPending || !!done}>
            {bulk.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save {toSave.length} row{toSave.length === 1 ? "" : "s"}
          </Button>
          {!pmConfigured && <span className="text-xs text-muted-foreground">The PM store isn't connected yet.</span>}
          {done && <span className="text-xs text-emerald-600">{done}</span>}
          {bulk.isError && <span className="text-xs text-destructive">{(bulk.error as { response?: { data?: { message?: string } } }).response?.data?.message ?? (bulk.error as Error).message}</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
