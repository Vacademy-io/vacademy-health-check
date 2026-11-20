import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ago, badgeText, unreadItems, type AlertItem } from "@/components/alerts/alerts";
import { useReadMarks } from "@/components/alerts/read-marks";
import { useAlertSources } from "@/components/alerts/sources";
import { count } from "@/components/external-apis/format";

/**
 * Top-right bell: unread alerts from every source, one section per source. An alert marked read
 * comes back when it happens again.
 */
export function AlertsBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const sources = useAlertSources();
  const { marks, mark } = useReadMarks();

  const sections = sources.map((s) => ({ ...s, unread: unreadItems(s.items, marks) }));
  const allUnread = sections.flatMap((s) => s.unread);
  const badge = badgeText(allUnread.length);
  const label = badge ? `${allUnread.length} unread alert${allUnread.length === 1 ? "" : "s"}` : "No unread alerts";

  const go = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={label} title={label}>
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
            <p className="text-sm font-medium">Alerts</p>
            <p className="text-xs text-muted-foreground">{allUnread.length ? `${allUnread.length} unread` : "All caught up"}</p>
          </div>
          {allUnread.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => mark(allUnread)}>
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[28rem] overflow-y-auto">
          {sections.map((s) => (
            <section key={s.key} className="border-b last:border-b-0">
              <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {s.label}
                  {s.unread.length > 0 && ` · ${s.unread.length}`}
                </p>
                <div className="flex shrink-0 items-center">
                  {s.unread.length > 1 && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => mark(s.unread)}>
                      Mark read
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label={`Open ${s.label}`}
                    title={`Open ${s.label}`}
                    onClick={() => go(s.href)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {s.isLoading && <p className="px-3 py-3 text-xs text-muted-foreground">Loading…</p>}
              {s.isError && <p className="px-3 py-3 text-xs text-muted-foreground">Could not load {s.label.toLowerCase()}.</p>}
              {!s.isLoading && !s.isError && s.unread.length === 0 && (
                <p className="px-3 py-3 text-xs text-muted-foreground">Nothing unread in the {s.window}.</p>
              )}
              {s.unread.map((item) => (
                <AlertRow key={item.key} item={item} onRead={() => mark([item])} />
              ))}
            </section>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AlertRow({ item, onRead }: { item: AlertItem; onRead: () => void }) {
  return (
    <div className="flex items-start gap-2 border-t px-3 py-2 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium">{item.title}</p>
          <span className="shrink-0 text-xs text-muted-foreground">{ago(item.lastAt)}</span>
        </div>
        <p className="truncate text-xs" title={item.detail}>
          {item.detail}
        </p>
        <p className="text-xs text-muted-foreground">
          {count(item.count)} times{item.hint ? ` · ${item.hint}` : ""}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-label={`Mark ${item.title} ${item.detail} read`}
        title="Mark read"
        onClick={onRead}
      >
        <Check className="h-4 w-4" />
      </Button>
    </div>
  );
}
