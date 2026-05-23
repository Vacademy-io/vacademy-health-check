import { useState } from "react";
import {
  useVimotionInviteCodes,
  useCreateInviteCode,
  useRevokeInviteCode,
  useInviteCodeRedemptions,
} from "@/services/vimotion-api";
import type {
  CreateInviteCodeRequestPayload,
  InviteCodeKind,
  InviteCodeStatus,
  VimotionInviteCode,
} from "@/types/vimotion";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoreHorizontal, Plus } from "lucide-react";

const STATUS_BADGE: Record<InviteCodeStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  exhausted: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  revoked: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const KIND_BADGE: Record<InviteCodeKind, string> = {
  open: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  locked: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

export default function VimotionInviteCodesPage() {
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [redemptionsFor, setRedemptionsFor] = useState<VimotionInviteCode | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pageSize = 25;

  const { data, isLoading } = useVimotionInviteCodes({ page, size: pageSize, kind, status });
  const createCode = useCreateInviteCode();
  const revoke = useRevokeInviteCode();
  const redemptions = useInviteCodeRedemptions(redemptionsFor?.id ?? null);

  const columns: Column<VimotionInviteCode & Record<string, unknown>>[] = [
    {
      key: "code",
      header: "Code",
      render: (row) => <span className="font-mono font-semibold">{row.code}</span>,
    },
    {
      key: "kind",
      header: "Kind",
      render: (row) => (
        <Badge variant="outline" className={KIND_BADGE[row.kind] || ""}>
          {row.kind}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant="outline" className={STATUS_BADGE[row.status] || ""}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: "uses",
      header: "Uses",
      render: (row) =>
        row.max_uses != null
          ? `${row.used_count} / ${row.max_uses}`
          : row.kind === "locked"
            ? `${row.used_count} / 1`
            : `${row.used_count}`,
    },
    {
      key: "bound_to",
      header: "Bound to",
      render: (row) => row.locked_email || "—",
    },
    {
      key: "expires_at",
      header: "Expires",
      render: (row) =>
        row.expires_at ? new Date(row.expires_at).toLocaleDateString() : "—",
    },
    {
      key: "note",
      header: "Note",
      render: (row) =>
        row.note ? (
          <span className="text-xs text-muted-foreground">{row.note}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "created_at",
      header: "Created",
      render: (row) => new Date(row.created_at).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRedemptionsFor(row)}>
              View redemptions
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={row.status !== "active"}
              onClick={() => {
                setErrorMsg(null);
                revoke.mutate(row.id, {
                  onError: (err) =>
                    setErrorMsg(err instanceof Error ? err.message : "Could not revoke"),
                });
              }}
            >
              Revoke
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vimotion Invite Codes"
        description="Open codes (Discord drops) and locked codes (per-recipient)."
        actions={
          <Button onClick={() => { setErrorMsg(null); setCreateOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            New code
          </Button>
        }
      />

      <DataTable
        data={(data?.content ?? []) as (VimotionInviteCode & Record<string, unknown>)[]}
        columns={columns}
        page={page}
        totalPages={data?.total_pages ?? 0}
        totalItems={data?.total_elements}
        onPageChange={setPage}
        isLoading={isLoading}
        rowId={(row) => row.id}
        toolbar={
          <>
            <Select value={kind || "all"} onValueChange={(v) => { setPage(0); setKind(v === "all" ? "" : v); }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All kinds" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="locked">Locked</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status || "all"} onValueChange={(v) => { setPage(0); setStatus(v === "all" ? "" : v); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="exhausted">Exhausted</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>
            {errorMsg && <span className="text-sm text-red-600">{errorMsg}</span>}
          </>
        }
      />

      <CreateCodeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(payload) => {
          setErrorMsg(null);
          createCode.mutate(payload, {
            onSuccess: () => setCreateOpen(false),
            onError: (err) =>
              setErrorMsg(err instanceof Error ? err.message : "Could not create code"),
          });
        }}
        isPending={createCode.isPending}
      />

      <Dialog
        open={!!redemptionsFor}
        onOpenChange={(open) => {
          if (!open) setRedemptionsFor(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Redemptions —{" "}
              <span className="font-mono">{redemptionsFor?.code}</span>
            </DialogTitle>
            <DialogDescription>
              Every time this code was used to complete signup.
            </DialogDescription>
          </DialogHeader>
          {redemptions.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {redemptions.data && redemptions.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No redemptions yet.</p>
          )}
          {redemptions.data && redemptions.data.length > 0 && (
            <div className="max-h-[400px] overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                    <th className="px-3 py-2 text-left font-medium">Phone</th>
                    <th className="px-3 py-2 text-left font-medium">Institute</th>
                    <th className="px-3 py-2 text-left font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.data.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{r.email}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.phone_number}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.institute_id || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(r.redeemed_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface CreateCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateInviteCodeRequestPayload) => void;
  isPending: boolean;
}

function CreateCodeDialog({ open, onOpenChange, onSubmit, isPending }: CreateCodeDialogProps) {
  const [kind, setKind] = useState<InviteCodeKind>("open");
  const [maxUses, setMaxUses] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [lockedEmail, setLockedEmail] = useState<string>("");
  const [lockedPhone, setLockedPhone] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const handleSubmit = () => {
    const payload: CreateInviteCodeRequestPayload = {
      kind,
      note: note.trim() || undefined,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    };
    if (kind === "open") {
      payload.max_uses = maxUses.trim() ? Number(maxUses) : null;
    } else {
      payload.locked_email = lockedEmail.trim();
      payload.locked_phone_number = lockedPhone.trim();
    }
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create invite code</DialogTitle>
          <DialogDescription>
            Open codes can be shared in Discord; locked codes are per-recipient.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as InviteCodeKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open (shared, N uses)</SelectItem>
                <SelectItem value="locked">Locked (per email/phone)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === "open" ? (
            <div className="space-y-2">
              <Label>Max uses (blank = unlimited)</Label>
              <Input
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="e.g. 100"
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Locked email</Label>
                <Input
                  type="email"
                  value={lockedEmail}
                  onChange={(e) => setLockedEmail(e.target.value)}
                  placeholder="alice@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Locked phone</Label>
                <Input
                  value={lockedPhone}
                  onChange={(e) => setLockedPhone(e.target.value)}
                  placeholder="+91 98xxxxxxxx"
                  className="font-mono"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Expires at (optional)</Label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Internal note</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Twitter drop #2"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Creating…" : "Create code"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
