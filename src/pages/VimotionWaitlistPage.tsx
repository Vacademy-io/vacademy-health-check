import { useState } from "react";
import { useVimotionWaitlist, useInviteWaitlistEntry, useRejectWaitlistEntry } from "@/services/vimotion-api";
import type {
  VimotionWaitlistEntry,
  WaitlistStatus,
  InviteWaitlistResponse,
} from "@/types/vimotion";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
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
import { MoreHorizontal, Copy, Check, AlertTriangle, Mail } from "lucide-react";

const STATUS_BADGE: Record<WaitlistStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  invited: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  converted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  rejected: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function VimotionWaitlistPage() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [inviting, setInviting] = useState<VimotionWaitlistEntry | null>(null);
  const [issued, setIssued] = useState<InviteWaitlistResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pageSize = 25;

  const { data, isLoading } = useVimotionWaitlist({ page, size: pageSize, search, status });
  const invite = useInviteWaitlistEntry();
  const reject = useRejectWaitlistEntry();

  const columns: Column<VimotionWaitlistEntry & Record<string, unknown>>[] = [
    {
      key: "effective_position",
      header: "#",
      className: "w-16 font-mono",
      render: (row) => `#${row.effective_position}`,
    },
    {
      key: "full_name",
      header: "Name",
      render: (row) => <span className="font-medium">{row.full_name}</span>,
    },
    { key: "email", header: "Email" },
    { key: "phone_number", header: "Phone", className: "font-mono text-xs" },
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
      key: "referral_count",
      header: "Refs",
      className: "text-right",
      render: (row) => row.referral_count.toLocaleString(),
    },
    { key: "source", header: "Source", render: (row) => row.source || "-" },
    {
      key: "created_at",
      header: "Joined",
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
            <DropdownMenuItem
              disabled={row.status === "converted" || row.status === "rejected"}
              onClick={() => {
                setErrorMsg(null);
                setInviting(row);
                setIssued(null);
              }}
            >
              Invite (issue code)
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={row.status === "rejected" || row.status === "converted"}
              onClick={() => {
                setErrorMsg(null);
                reject.mutate(row.id, {
                  onError: (err) =>
                    setErrorMsg(err instanceof Error ? err.message : "Could not reject"),
                });
              }}
            >
              Reject
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const handleInvite = (sendEmail: boolean) => {
    if (!inviting) return;
    setErrorMsg(null);
    invite.mutate(
      { id: inviting.id, payload: { send_email: sendEmail } },
      {
        onSuccess: (response) => setIssued(response),
        onError: (err) =>
          setErrorMsg(err instanceof Error ? err.message : "Could not issue invite"),
      }
    );
  };

  const handleCopyCode = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable; user can select the code manually
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vimotion Waitlist"
        description="People who signed up to be invited. Issue codes from here."
      />

      <DataTable
        data={(data?.content ?? []) as (VimotionWaitlistEntry & Record<string, unknown>)[]}
        columns={columns}
        page={page}
        totalPages={data?.total_pages ?? 0}
        totalItems={data?.total_elements}
        onPageChange={setPage}
        isLoading={isLoading}
        rowId={(row) => row.id}
        toolbar={
          <>
            <SearchInput value={search} onChange={(v) => { setPage(0); setSearch(v); }} placeholder="Search name, email, phone…" />
            <Select value={status || "all"} onValueChange={(v) => { setPage(0); setStatus(v === "all" ? "" : v); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            {errorMsg && (
              <span className="text-sm text-red-600">{errorMsg}</span>
            )}
          </>
        }
      />

      {/* Invite dialog */}
      <Dialog
        open={!!inviting}
        onOpenChange={(open) => {
          if (!open) {
            setInviting(null);
            setIssued(null);
            setErrorMsg(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {!issued ? (
            <>
              <DialogHeader>
                <DialogTitle>Issue invite code</DialogTitle>
                <DialogDescription>
                  A locked code will be generated for <strong>{inviting?.email}</strong> and the
                  waitlist row will be marked as invited.
                </DialogDescription>
              </DialogHeader>
              {errorMsg && (
                <p className="text-sm text-red-600">{errorMsg}</p>
              )}
              <DialogFooter className="sm:justify-between">
                <Button
                  variant="outline"
                  disabled={invite.isPending}
                  onClick={() => handleInvite(false)}
                >
                  Generate (no email)
                </Button>
                <Button disabled={invite.isPending} onClick={() => handleInvite(true)}>
                  {invite.isPending ? "Sending…" : "Generate & email"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Code ready</DialogTitle>
                <DialogDescription>
                  Share this code with <strong>{inviting?.email}</strong>. The redemption deep-link
                  prefills Step 0 automatically.
                </DialogDescription>
              </DialogHeader>

              {/* Email-send status — admin needs to know whether to follow up
                  manually. null = email wasn't requested; true = sent; false = attempted but failed. */}
              {issued.email_sent === true && (
                <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
                  <Mail className="h-4 w-4" />
                  Email sent to {inviting?.email}.
                </div>
              )}
              {issued.email_sent === false && (
                <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Email send failed (check notification_service logs). The code is still valid —
                    please share the deep-link below manually.
                  </span>
                </div>
              )}
              {issued.email_sent === null && (
                <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
                  <Mail className="h-4 w-4" />
                  Code generated. Share the deep-link below manually.
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Code</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={issued.code.code}
                      className="font-mono text-base"
                    />
                    <Button onClick={handleCopyCode} className="gap-2">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Deep link</Label>
                  <Input
                    readOnly
                    value={`https://app.vimotion.ai/vim/onboarding?code=${issued.code.code}`}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    setInviting(null);
                    setIssued(null);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
