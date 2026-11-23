import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { emptyRecord, FOLLOW_UP_LABEL, FOLLOW_UP_OUTCOMES, type FollowUpOutcome } from "@/lib/pm-record";
import { localDate, type AccountRow } from "@/lib/pm-view";
import { useSavePmRecord } from "@/services/pm-api";

const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localDate(d);
};

interface Props {
  account: AccountRow | null;
  onOpenChange: (open: boolean) => void;
  pmConfigured: boolean;
}

/** Record how a check-in went and when to check in next. Saved to the PM store only. */
export function FollowUpDialog({ account, onOpenChange, pmConfigured }: Props) {
  return (
    <Dialog open={!!account} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">{account && <Body key={account.id} account={account} pmConfigured={pmConfigured} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function Body({ account: a, pmConfigured, onDone }: { account: AccountRow; pmConfigured: boolean; onDone: () => void }) {
  const [outcome, setOutcome] = useState<FollowUpOutcome>("POSITIVE");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(localDate(new Date()));
  const [next, setNext] = useState(plusDays(3));
  const save = useSavePmRecord();
  const last = a.record?.followUps[0];

  const onSave = () => {
    const base = a.record ?? emptyRecord(a.id, a.name);
    save.mutate(
      {
        ...base,
        name: a.name,
        classification: base.classification ?? (a.trial && !a.paid ? "TRIAL" : base.classification),
        followUps: [{ date, outcome, note: note.trim(), by: "" }, ...base.followUps],
        nextFollowUp: outcome === "NOT_INTERESTED" ? "" : next,
      },
      { onSuccess: onDone }
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Update: {a.name}</DialogTitle>
        <DialogDescription>
          {last ? `Last update ${last.date}: ${FOLLOW_UP_LABEL[last.outcome]}${last.note ? ` · "${last.note}"` : ""}` : "No update recorded yet."} Saved in the PM register only.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">How is it going?</p>
          <div className="flex flex-wrap gap-1.5">
            {FOLLOW_UP_OUTCOMES.map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={outcome === o}
                onClick={() => setOutcome(o)}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium", outcome === o ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
              >
                {FOLLOW_UP_LABEL[o]}
              </button>
            ))}
          </div>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">What did they say?</span>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added 2 teachers, waiting for the principal's approval" autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Date of this update</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Next check-in</span>
            <Input type="date" value={outcome === "NOT_INTERESTED" ? "" : next} disabled={outcome === "NOT_INTERESTED"} onChange={(e) => setNext(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {[1, 3, 7].map((n) => (
            <button key={n} type="button" className="rounded border px-2 py-0.5 hover:bg-accent" onClick={() => setNext(plusDays(n))} disabled={outcome === "NOT_INTERESTED"}>
              in {n} day{n === 1 ? "" : "s"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Button onClick={onSave} disabled={!pmConfigured || save.isPending}>
          {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save update
        </Button>
        {!pmConfigured && <span className="text-xs text-muted-foreground">The PM store isn't connected yet.</span>}
        {save.isError && <span className="text-xs text-destructive">{(save.error as Error).message}</span>}
      </div>
    </>
  );
}
