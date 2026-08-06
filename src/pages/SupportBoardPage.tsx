import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, Inbox, Loader2, Lock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import {
  useEngineers,
  useSupportTickets,
  useUpdateTicketStatus,
  type SupportTicketDto,
  type TicketPriority,
  type TicketSource,
  type TicketStatus,
} from "@/services/support-api";
import { TicketFormDialog } from "@/components/support/TicketFormDialog";
import { SupportFilterBar } from "@/components/support/SupportFilterBar";
import { EMPTY_FILTERS, UNASSIGNED, type SupportFilters } from "@/lib/support-filters";
import { toCreatedParams } from "@/lib/date-range";
import { useDebounced } from "@/hooks/use-debounced";

const COLUMNS: { status: TicketStatus; label: string; accent: string }[] = [
  { status: "OPEN", label: "Open", accent: "border-t-amber-400" },
  { status: "IN_PROGRESS", label: "In progress", accent: "border-t-blue-400" },
  { status: "WAITING_ON_CUSTOMER", label: "Waiting on customer", accent: "border-t-slate-400" },
  { status: "RESOLVED", label: "Resolved", accent: "border-t-green-400" },
  { status: "CLOSED", label: "Closed", accent: "border-t-zinc-400" },
];

const PRIORITY_META: Record<TicketPriority, { label: string; variant: BadgeVariant }> = {
  MAJOR: { label: "Major", variant: "destructive" },
  MINOR: { label: "Minor", variant: "secondary" },
};
type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

const SOURCE_LABEL: Record<TicketSource, string> = {
  PORTAL: "Portal",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  PHONE: "Phone",
  MANUAL: "Manual",
  OTHER: "Other",
};

const PER_COLUMN = 50;

function fmt(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SupportBoardPage() {
  // The board has no status filter — its columns are the status axis.
  const [filters, setFilters] = useState<SupportFilters>({ ...EMPTY_FILTERS, status: undefined });
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TicketStatus | null>(null);

  const engineers = useEngineers();
  const updateStatus = useUpdateTicketStatus();
  const debouncedSearch = useDebounced(filters.search, 300);
  const engineerParam =
    filters.engineerId === "ALL" || filters.engineerId === UNASSIGNED
      ? undefined
      : filters.engineerId;
  const instituteIds = filters.institutes.map((i) => i.id);

  // One query per column so each is complete up to PER_COLUMN. Fixed count → hook order is stable.
  // Newest activity first, so a column truncated at PER_COLUMN drops the stalest cards, not random ones.
  const common = {
    engineerId: engineerParam,
    unassigned: filters.engineerId === UNASSIGNED,
    search: debouncedSearch,
    instituteIds,
    ...toCreatedParams(filters.dateRange),
    sortBy: "lastMessageAt" as const,
    sortDirection: "DESC" as const,
    size: PER_COLUMN,
  };
  const open = useSupportTickets({ ...common, status: "OPEN" });
  const inProgress = useSupportTickets({ ...common, status: "IN_PROGRESS" });
  const waiting = useSupportTickets({ ...common, status: "WAITING_ON_CUSTOMER" });
  const resolved = useSupportTickets({ ...common, status: "RESOLVED" });
  const closed = useSupportTickets({ ...common, status: "CLOSED" });

  const byStatus: Record<TicketStatus, ReturnType<typeof useSupportTickets>> = {
    OPEN: open,
    IN_PROGRESS: inProgress,
    WAITING_ON_CUSTOMER: waiting,
    RESOLVED: resolved,
    CLOSED: closed,
  };

  const onDropTo = (target: TicketStatus, payload: string) => {
    setDragOverStatus(null);
    try {
      const { id, from } = JSON.parse(payload) as { id: string; from: TicketStatus };
      if (id && from !== target) updateStatus.mutate({ id, status: target });
    } catch {
      // malformed drag payload — ignore
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* The header keeps only actions; filters get their own row so neither wraps into the other. */}
      <PageHeader
        title="Support board"
        description="Drag tickets across columns to update status. Built for standups."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New ticket
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/support">
                <Inbox className="mr-1 h-4 w-4" /> Inbox
              </Link>
            </Button>
          </div>
        }
      />

      <SupportFilterBar
        value={filters}
        onChange={setFilters}
        engineers={engineers.data ?? []}
      />

      <TicketFormDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Cards open here rather than deep-linking to the inbox — edit/assign without leaving the board. */}
      <TicketFormDialog
        open={!!editingId}
        onOpenChange={(v) => !v && setEditingId(null)}
        ticketId={editingId}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-x-auto md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const q = byStatus[col.status];
          const tickets = q.data?.content ?? [];
          const isOver = dragOverStatus === col.status;
          return (
            <div
              key={col.status}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverStatus !== col.status) setDragOverStatus(col.status);
              }}
              onDragLeave={(e) => {
                // Only clear when the pointer actually leaves the column, not a child.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStatus(null);
              }}
              onDrop={(e) => onDropTo(col.status, e.dataTransfer.getData("text/plain"))}
              className={cn(
                "flex min-h-0 flex-col rounded-lg border border-t-2 bg-muted/30",
                col.accent,
                isOver && "ring-2 ring-primary ring-offset-1"
              )}
            >
              <div className="flex items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>{col.label}</span>
                <Badge variant="outline" className="text-[10px]">
                  {q.isLoading ? "…" : tickets.length}
                  {tickets.length >= PER_COLUMN ? "+" : ""}
                </Badge>
              </div>
              <div className="min-h-[4rem] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {q.isLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : tickets.length === 0 ? (
                  <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">Empty</p>
                ) : (
                  tickets.map((t) => (
                    <BoardCard key={t.id} ticket={t} onOpen={() => setEditingId(t.id)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({ ticket, onOpen }: { ticket: SupportTicketDto; onOpen: () => void }) {
  // A drag ends with a click event in some browsers; suppress it so dropping never opens the popup.
  const [dragging, setDragging] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!dragging) onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      draggable
      onDragStart={(e) => {
        setDragging(true);
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({ id: ticket.id, from: ticket.status })
        );
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => setDragging(false)}
      className="block cursor-grab rounded-md border bg-card p-2.5 text-left shadow-sm transition-shadow hover:shadow focus:outline-none focus:ring-2 focus:ring-ring active:cursor-grabbing"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium">{ticket.subject}</span>
        <Badge variant={PRIORITY_META[ticket.priority].variant} className="shrink-0 text-[10px]">
          {PRIORITY_META[ticket.priority].label}
        </Badge>
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {ticket.ticketNumber ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {ticket.ticketNumber} ·{" "}
          </span>
        ) : null}
        {ticket.instituteName || ticket.instituteId}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {ticket.internalOnly ? (
          <Badge variant="outline" className="gap-0.5 border-amber-300 bg-amber-50 text-[10px] text-amber-700">
            <Lock className="h-2.5 w-2.5" /> Internal
          </Badge>
        ) : null}
        {ticket.overdue ? (
          <Badge variant="destructive" className="gap-0.5 text-[10px]">
            <AlertTriangle className="h-2.5 w-2.5" /> overdue
          </Badge>
        ) : null}
        {ticket.source && ticket.source !== "PORTAL" ? (
          <Badge variant="outline" className="text-[10px]">
            {SOURCE_LABEL[ticket.source]}
          </Badge>
        ) : null}
        {ticket.eta ? (
          <Badge variant="secondary" className="gap-0.5 text-[10px]">
            <CalendarClock className="h-2.5 w-2.5" /> {fmt(ticket.eta)}
          </Badge>
        ) : null}
      </div>
      <div className="mt-1.5 text-[10px] text-muted-foreground">
        {ticket.assignedEngineerName ? (
          <span>{ticket.assignedEngineerName}</span>
        ) : (
          <span className="text-amber-600">Unassigned</span>
        )}
      </div>
    </div>
  );
}
