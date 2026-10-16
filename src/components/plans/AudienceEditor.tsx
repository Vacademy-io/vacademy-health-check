import { useEffect, useState } from "react";
import { Ban, Building2, Loader2, Plus, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorDetail } from "@/lib/eval-api-pricing";
import { addRule, buildAudiencePut, parseSegmentKey, ruleKey, sameRule } from "@/lib/plan-billing";
import type { AudiencePutBody, AudienceRule, AudienceRuleKind } from "@/types/plan-billing";
import { Field, ReasonField } from "./shared";
import { InstitutePicker } from "./InstitutePicker";

type Notify = (tone: "success" | "error" | "info", text: string) => void;

/**
 * Institutes and segments, each included or excluded, saved as one set (PUT … {institute_ids,
 * segments, exclude_institute_ids, exclude_segments, reason}). An exclusion always wins. Used for a
 * plan's audience and for the storefront allowlist. Nothing is saved until "Save".
 */
export function AudienceEditor({
  idPrefix,
  rules,
  showSegments = true,
  emptyText,
  saving,
  onSave,
  notify,
  savedText,
}: {
  idPrefix: string;
  rules: AudienceRule[];
  showSegments?: boolean;
  emptyText: string;
  saving: boolean;
  onSave: (body: AudiencePutBody) => Promise<unknown>;
  notify: Notify;
  savedText: string;
}) {
  const [draft, setDraft] = useState<AudienceRule[]>(rules);
  const [instId, setInstId] = useState("");
  const [segment, setSegment] = useState("");
  const [kind, setKind] = useState<AudienceRuleKind>("INCLUDE");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  // A refetch after a save replaces the draft with what the server stored. Keyed on the content,
  // so a caller passing a fresh [] each render does not loop.
  const sig = rules.map(ruleKey).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(rules), [sig]);

  const dirty = draft.length !== rules.length || draft.some((r) => !rules.some((x) => ruleKey(x) === ruleKey(r)));

  const addSegment = () => {
    setError(null);
    const k = parseSegmentKey(segment);
    if ("error" in k) return setError(k.error);
    setDraft((d) => addRule(d, { rule: kind, institute_id: null, institute_name: null, segment_key: k.value }));
    setSegment("");
  };

  const save = async () => {
    setError(null);
    const built = buildAudiencePut(draft, reason);
    if ("error" in built) return setError(built.error);
    try {
      await onSave(built.body);
      notify("success", savedText);
      setReason("");
    } catch (err) {
      setError(errorDetail(err, "Could not save"));
    }
  };

  return (
    <div className="space-y-3">
      {draft.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {draft.map((r) => (
            <li
              key={ruleKey(r)}
              className={
                r.rule === "EXCLUDE"
                  ? "flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-xs"
                  : "flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs"
              }
            >
              {r.rule === "EXCLUDE" && (
                <span className="flex items-center gap-0.5 font-medium text-destructive">
                  <Ban className="h-3 w-3" /> not
                </span>
              )}
              {r.institute_id ? <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> : <Tag className="h-3.5 w-3.5 text-muted-foreground" />}
              {r.institute_id ? (
                <span>
                  {r.institute_name ?? <span className="font-mono">{r.institute_id}</span>}
                  {r.institute_name && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{r.institute_id.slice(0, 8)}</span>}
                </span>
              ) : (
                <span>
                  segment <span className="font-mono">{r.segment_key}</span>
                </span>
              )}
              <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-accent" aria-label="Remove" onClick={() => setDraft((d) => d.filter((x) => !sameRule(x, r)))}>
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs" role="radiogroup" aria-label="Add as">
        <span className="text-muted-foreground">Add as</span>
        {(["INCLUDE", "EXCLUDE"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={kind === k ? "rounded border border-primary px-2 py-0.5 font-medium" : "rounded border px-2 py-0.5 text-muted-foreground hover:bg-accent"}
          >
            {k === "INCLUDE" ? "Included" : "Excluded (always wins)"}
          </button>
        ))}
      </div>
      <div className={showSegments ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
        <Field label="Add an institute">
          <InstitutePicker
            value={instId}
            onChange={(id, name) => {
              if (!id) return setInstId("");
              setDraft((d) => addRule(d, { rule: kind, institute_id: id, institute_name: name, segment_key: null }));
              setInstId("");
            }}
          />
        </Field>
        {showSegments && (
          <Field label="Add a segment" htmlFor={`${idPrefix}-seg`} hint="Members of each segment are edited on the storefront page.">
            <div className="flex gap-2">
              <Input
                id={`${idPrefix}-seg`}
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSegment();
                  }
                }}
                placeholder="e.g. pilot"
                className="h-9 font-mono"
              />
              <Button type="button" size="sm" variant="outline" onClick={addSegment} disabled={segment.trim() === ""}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
          </Field>
        )}
      </div>
      {dirty && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-amber-500/40 p-3">
          <ReasonField id={`${idPrefix}-reason`} value={reason} onChange={setReason} className="min-w-[240px] flex-1" />
          <Button size="sm" variant="outline" onClick={() => setDraft(rules)} disabled={saving}>
            Discard
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
