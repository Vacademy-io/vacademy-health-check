import { useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useEngineers,
  useInstituteConfig,
  useSupportPlans,
  useUpdateInstituteConfig,
} from "@/services/support-api";

export function InstituteSupportDialog({
  open,
  onOpenChange,
  instituteId,
  instituteName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instituteId: string;
  instituteName?: string | null;
}) {
  const config = useInstituteConfig(open ? instituteId : null, instituteName);
  const plans = useSupportPlans();
  const engineers = useEngineers();
  const save = useUpdateInstituteConfig();

  const [plan, setPlan] = useState<string>("PREMIUM");
  const [emails, setEmails] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string>("");

  useEffect(() => {
    if (config.data) {
      setPlan(config.data.plan);
      setEmails((config.data.alertEmails ?? []).join("\n"));
      const ids = (config.data.engineers ?? []).map((e) => e.id);
      setSelected(ids);
      setPrimary((config.data.engineers ?? []).find((e) => e.primary)?.id ?? "");
    }
  }, [config.data]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const planDetail = plans.data?.find((p) => p.key === plan);

  const onSave = async () => {
    await save.mutateAsync({
      instituteId,
      payload: {
        plan,
        alertEmails: emails
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
        engineerIds: selected,
        primaryEngineerId: selected.includes(primary) ? primary : undefined,
        instituteName: instituteName ?? undefined,
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Institute support setup</DialogTitle>
          <DialogDescription>{instituteName || instituteId}</DialogDescription>
        </DialogHeader>

        {config.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Plan */}
            <div className="space-y-1.5">
              <Label>Support plan</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(plans.data ?? []).map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {planDetail ? (
                <p className="text-xs text-muted-foreground">
                  {planDetail.hoursOfOperation} · major {planDetail.majorSlaText} · minor{" "}
                  {planDetail.minorSlaText}
                  {planDetail.dedicatedEngineer ? " · dedicated engineer" : ""}
                </p>
              ) : null}
            </div>

            {/* Dedicated engineers */}
            <div className="space-y-1.5">
              <Label>Assigned engineers</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {(engineers.data ?? []).length === 0 ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">
                    No engineers yet — add some in Support → Settings.
                  </p>
                ) : (
                  (engineers.data ?? []).map((e) => {
                    const checked = selected.includes(e.id);
                    return (
                      <div
                        key={e.id}
                        className="flex items-center justify-between rounded px-1 py-1 hover:bg-accent"
                      >
                        <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                          <input type="checkbox" checked={checked} onChange={() => toggle(e.id)} />
                          <span>{e.name}</span>
                          <span className="text-xs text-muted-foreground">{e.email}</span>
                        </label>
                        {checked ? (
                          <button
                            type="button"
                            title="Make primary"
                            onClick={() => setPrimary(e.id)}
                            className={cn(
                              "rounded p-1",
                              primary === e.id
                                ? "text-amber-500"
                                : "text-muted-foreground hover:text-amber-500"
                            )}
                          >
                            <Star
                              className="h-4 w-4"
                              fill={primary === e.id ? "currentColor" : "none"}
                            />
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                The starred engineer is the primary/dedicated owner.
              </p>
            </div>

            {/* Alert email override */}
            <div className="space-y-1.5">
              <Label>Alert emails (override)</Label>
              <textarea
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                rows={3}
                placeholder="ops@institute.com, oncall@institute.com"
                className="w-full resize-none rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                One per line or comma-separated. These are alerted in addition to the global list.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={save.isPending || config.isLoading}>
            {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
