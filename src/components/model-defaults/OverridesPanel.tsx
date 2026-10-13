import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useModelOverrides } from "@/services/model-defaults-api";
import { errorDetail } from "@/lib/eval-api-pricing";
import { GLM_MODEL_ID, isNotFound } from "@/lib/model-defaults";
import { ModelLabel, type ModelContext } from "./ModelLabel";

const PAGE = 100;

/** Read-only: default models set on ai_api_keys per institute / user. */
export function OverridesPanel({ ctx }: { ctx: ModelContext }) {
  const { data, isLoading, isError, error } = useModelOverrides();
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data ?? [];
    if (!q) return list;
    return list.filter((r) =>
      [r.institute_id, r.user_id, r.default_model].some((v) => (v ?? "").toLowerCase().includes(q))
    );
  }, [data, query]);

  const byo = (data ?? []).filter((r) => r.has_own_key).length;
  const offPlatform = (data ?? []).filter((r) => r.default_model && r.default_model !== GLM_MODEL_ID && r.default_model !== ctx.platformDefault).length;
  const shown = showAll ? rows : rows.slice(0, PAGE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Institute &amp; user overrides</CardTitle>
        <CardDescription>
          Read-only. Default models set on an institute's or user's AI key (ai_api_keys). These win over the feature
          defaults above. Rows marked “own key” use the customer's own provider key — the model is their choice and
          their bill. Other explicit picks stay honoured and are billed at cost + 50%.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {isError && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {isNotFound(error) ? "The overrides endpoint isn't deployed on ai-service yet." : errorDetail(error, "Could not load overrides")}
          </p>
        )}
        {data && data.length === 0 && <p className="text-sm text-muted-foreground">No institute or user has set a default model.</p>}
        {data && data.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {data.length} row{data.length === 1 ? "" : "s"} · {byo} with their own key · {offPlatform} not on the platform default
              </p>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by institute, user or model"
                className="h-9 w-full sm:w-72"
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Default model</TableHead>
                  <TableHead>Key</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="align-top">
                      {r.institute_id ? (
                        <Link to={`/institutes/${r.institute_id}`} className="font-mono text-xs text-primary hover:underline">
                          institute {r.institute_id}
                        </Link>
                      ) : null}
                      {r.user_id && <p className="font-mono text-xs text-muted-foreground">user {r.user_id}</p>}
                      {!r.institute_id && !r.user_id && <span className="text-xs text-muted-foreground">platform</span>}
                    </TableCell>
                    <TableCell className="align-top">
                      <ModelLabel modelId={r.default_model} ctx={ctx} empty="none set" />
                    </TableCell>
                    <TableCell className="align-top">
                      {r.has_own_key ? (
                        <Badge variant="secondary" title="Customer's own provider key — their choice">
                          own key
                        </Badge>
                      ) : (
                        <Badge variant="outline">platform key</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > PAGE && (
              <button type="button" className="text-sm text-primary hover:underline" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${rows.length}`}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
