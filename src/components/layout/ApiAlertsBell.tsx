import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useApiAlerts, useMarkAlertsRead } from "@/services/external-api-alerts-api";
import { ago, alertLabel, badgeText, markAll, markKind, type AlertGroup } from "@/components/external-apis/alerts";
import { failureHint } from "@/components/external-apis/attention";
import { count, vendorName } from "@/components/external-apis/format";

/**
 * Top-right bell: failed calls to the integrated APIs that nobody has marked read yet. Marking a
 * kind read clears it for every admin; a new failure of that kind brings it back.
 */
export function ApiAlertsBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const alerts = useApiAlerts();
  const markRead = useMarkAlertsRead();

  const data = alerts.data;
  const badge = badgeText(data?.unread ?? 0);
  const groups = data?.groups ?? [];

  const markOne = (g: AlertGroup) => data && markRead.mutate(markKind(data, g));

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={badge ? `${data?.unread} unread API failures` : "API failures"}
          title={badge ? `${data?.unread} unread API failures` : "No unread API failures"}
        >
          <Bell className="h-4 w-4" />
          {badge && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {badge}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div>
            <p className="text-sm font-medium">API failures needing attention</p>
            <p className="text-xs text-muted-foreground">
              {data ? `${count(data.unread)} unread in the last 7 days` : "Failed calls to integrated APIs"}
            </p>
          </div>
          {groups.length > 0 && data && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(markAll(data))}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {alerts.isLoading && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {alerts.isError && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Could not load API failures. The list on External APIs still works.
            </p>
          )}
          {data && groups.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No unread API failures.</p>
          )}
          {groups.map((g) => {
            const hint = failureHint(g.http_status, g.reason);
            return (
              <div
                key={`${g.vendor}|${g.http_status ?? ""}|${g.reason}`}
                className="flex items-start gap-2 border-b px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{vendorName(g.vendor)}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{ago(g.last_at)}</span>
                  </div>
                  <p className="truncate text-xs" title={alertLabel(g)}>
                    {alertLabel(g)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {count(g.failed)} failed{hint ? ` · ${hint}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label={`Mark ${vendorName(g.vendor)} ${alertLabel(g)} read`}
                  title="Mark read"
                  disabled={markRead.isPending}
                  onClick={() => markOne(g)}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          {data && data.groups.length > 0 && data.unread > groups.reduce((n, g) => n + g.failed, 0) && (
            <p className="px-3 py-2 text-xs text-muted-foreground">More kinds than shown; open External APIs for all.</p>
          )}
        </div>

        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs"
            onClick={() => {
              setOpen(false);
              navigate("/external-apis");
            }}
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            Open External APIs
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
