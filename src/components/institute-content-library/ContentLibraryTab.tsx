import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, ChevronRight, Crown, Eye, Loader2, ServerOff, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { Toggle } from "@/components/shared/Toggle";
import { cn } from "@/lib/utils";
import { errorDetail } from "@/lib/eval-api-pricing";
import { childrenByParent, hiddenAncestor, pathOf, searchVisible, visibleQuestionCount } from "@/lib/content-library";
import {
  contentLibraryHttpStatus,
  useContentLibraryTree,
  useInstituteLibraryAccess,
  useSetLibraryAccess,
} from "@/services/content-library-api";
import type { LibraryNode } from "@/types/content-library";

/**
 * Content Library for one institute. It sees every course under Content Library >
 * Questions unless one is hidden here. Hiding a course hides everything inside it.
 */
export function ContentLibraryTab({ instituteId, instituteName }: { instituteId: string; instituteName: string }) {
  const tree = useContentLibraryTree();
  const access = useInstituteLibraryAccess(instituteId);
  const setAccess = useSetLibraryAccess(instituteId);
  const { toasts, push, dismiss } = useToasts();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);

  const nodes = useMemo(() => tree.data?.nodes ?? [], [tree.data]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const children = useMemo(() => childrenByParent(nodes), [nodes]);
  const hidden = useMemo(() => new Set(access.data?.hidden_node_ids ?? []), [access.data]);
  const visible = useMemo(() => searchVisible(nodes, query), [nodes, query]);

  const error = tree.error ?? access.error;
  const status = contentLibraryHttpStatus(error);

  if (tree.isLoading || access.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    const notDeployed = status === 404;
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-6 text-sm">
          {notDeployed ? (
            <ServerOff className="mt-0.5 h-5 w-5 text-muted-foreground" />
          ) : (
            <ShieldAlert className="mt-0.5 h-5 w-5 text-red-500" />
          )}
          <div className="space-y-2">
            <p className="font-medium">
              {notDeployed
                ? "Content Library controls are not live yet"
                : status === 403
                  ? "Your account is not allowed to manage the Content Library"
                  : "Could not load the Content Library"}
            </p>
            <p className="text-muted-foreground">
              {notDeployed
                ? "They arrive with the next assessment-service deploy."
                : errorDetail(error, "Please try again.")}
            </p>
            {!notDeployed && (
              <Button variant="outline" size="sm" onClick={() => { tree.refetch(); access.refetch(); }}>
                Retry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (access.data && !access.data.library_configured) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          The Content Library is not set up on this platform (no owner institute is configured).
        </CardContent>
      </Card>
    );
  }

  if (access.data?.owner) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-6 text-sm">
          <Crown className="mt-0.5 h-5 w-5 text-amber-500" />
          <div>
            <p className="font-medium">{instituteName} owns the Content Library</p>
            <p className="text-muted-foreground">
              It sees and edits every course ({nodes.length} topics). Hide courses from other institutes on their pages.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const toggle = (node: LibraryNode, on: boolean) => {
    setPending(node.id);
    setAccess.mutate(
      { nodeId: node.id, on },
      {
        onSuccess: () =>
          push("success", on ? `${instituteName} sees "${node.name}" again` : `Hid "${node.name}" from ${instituteName}`),
        onError: (err) => push("error", errorDetail(err, "Could not save the change")),
        onSettled: () => setPending(null),
      }
    );
  };

  const flip = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hiddenList = [...hidden].filter((id) => byId.has(id));
  const questionTotal = visibleQuestionCount(nodes, hidden);

  const renderLevel = (parentKey: string, depth: number): ReactNode =>
    (children.get(parentKey) ?? [])
      .filter((node) => !visible || visible.has(node.id))
      .map((node) => {
        const kids = children.get(node.id) ?? [];
        const open = visible ? true : expanded.has(node.id);
        const direct = hidden.has(node.id);
        const via = direct ? null : hiddenAncestor(node.id, byId, hidden);
        const busy = pending === node.id;
        return (
          <div key={node.id}>
            <div
              className={cn(
                "flex items-center gap-2 border-b py-2 pr-2 text-sm",
                (direct || via) && "text-muted-foreground",
                direct && "bg-muted/50"
              )}
              style={{ paddingLeft: `${depth * 20 + 8}px` }}
            >
              {kids.length > 0 ? (
                <button
                  type="button"
                  onClick={() => flip(node.id)}
                  aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-muted"
                >
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <span className={cn("min-w-0 flex-1 truncate", depth === 0 && "font-medium")}>{node.name}</span>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {node.question_count ?? 0} questions
              </span>
              {(node.hidden_count ?? 0) > 0 && (
                <Badge variant="outline" className="hidden shrink-0 md:inline-flex">
                  Hidden from {node.hidden_count} institute{node.hidden_count === 1 ? "" : "s"}
                </Badge>
              )}
              {via ? (
                <span className="shrink-0 text-xs" title={`Hidden with ${pathOf(via.id, byId)}`}>
                  Hidden with course
                </span>
              ) : busy ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : null}
              <Toggle
                checked={!direct && !via}
                disabled={!!via || setAccess.isPending}
                onChange={(next) => toggle(node, next)}
                label={`${direct ? "Show" : "Hide"} ${node.name}`}
              />
            </div>
            {open && kids.length > 0 && renderLevel(node.id, depth + 1)}
          </div>
        );
      });

  return (
    <div className="space-y-4">
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" /> Content Library
          </CardTitle>
          <CardDescription>
            {instituteName} sees every course under Content Library › Questions unless it is hidden here. Turn a course
            or topic off to hide it, with everything inside it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {hiddenList.length === 0 ? (
            <p className="text-sm">
              Sees the whole library · <span className="font-medium">{questionTotal}</span> questions
            </p>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-medium">{hiddenList.length}</span> hidden ·{" "}
                <span className="font-medium">{questionTotal}</span> questions visible
              </p>
              <div className="flex flex-wrap gap-2">
                {hiddenList.map((id) => (
                  <Badge key={id} variant="secondary" className="gap-1 py-1 pl-2 pr-1">
                    {pathOf(id, byId)}
                    <button
                      type="button"
                      onClick={() => toggle(byId.get(id)!, true)}
                      disabled={setAccess.isPending}
                      aria-label={`Show ${byId.get(id)!.name} again`}
                      title="Show again"
                      className="rounded-full p-0.5 hover:bg-background disabled:opacity-50"
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">All courses</CardTitle>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics"
            className="h-9 max-w-xs"
          />
        </CardHeader>
        <CardContent className="p-0">
          {nodes.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">The library has no courses yet.</p>
          ) : visible && visible.size === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No topic matches "{query.trim()}".</p>
          ) : (
            <div className="border-t">{renderLevel("", 0)}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
