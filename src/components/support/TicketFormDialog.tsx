import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2, Lock, MessagesSquare, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInstitutes } from "@/services/institutes-api";
import {
  useCreateSupportTicket,
  useEngineers,
  useInstituteContacts,
  useSupportTicket,
  useUpdateTicket,
  type AttachmentDto,
  type SupportTicketDto,
  type TicketCategory,
  type TicketPriority,
  type TicketSource,
  type TicketStatus,
} from "@/services/support-api";
import { AttachmentUploader } from "./AttachmentUploader";

/** Radix Select forbids an empty-string item value, so "no reporter" needs a sentinel. */
const NO_REPORTER = "__NONE__";

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_ON_CUSTOMER", label: "Waiting on customer" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: "QUESTION", label: "Question" },
  { value: "BUG", label: "Bug" },
  { value: "BILLING", label: "Billing" },
  { value: "FEATURE_REQUEST", label: "Feature request" },
  { value: "OTHER", label: "Other" },
];
const SOURCE_OPTIONS: { value: TicketSource; label: string }[] = [
  { value: "MANUAL", label: "Manual entry" },
  { value: "EMAIL", label: "Email" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "PHONE", label: "Phone / call" },
  { value: "OTHER", label: "Other" },
];

/** Format an ISO string into the value a datetime-local input expects (local time, no seconds). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Log a new ticket for an institute, or edit an existing one. Pass `ticketId` to edit — the
 * dialog loads the full detail itself, so any page can open it with just an id.
 */
export function TicketFormDialog({
  open,
  onOpenChange,
  ticketId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Present = edit that ticket; absent = create a new one. */
  ticketId?: string | null;
  onCreated?: (ticketId: string) => void;
}) {
  const isEdit = !!ticketId;
  const detail = useSupportTicket(open && ticketId ? ticketId : null);
  const ticket = detail.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit ticket" : "Log a ticket for an institute"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the details, attachments or visibility of this ticket."
              : "For issues a client reported over email, WhatsApp or a call. It appears in the institute's own support panel, attributed to Vacademy Support."}
          </DialogDescription>
        </DialogHeader>

        {isEdit && detail.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {/* Remount per target so the form always starts from the right initial state. */}
        {open && (!isEdit || ticket) ? (
          <TicketForm
            key={ticket?.id ?? "new"}
            ticket={ticket}
            onClose={() => onOpenChange(false)}
            onCreated={(id) => {
              onCreated?.(id);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TicketForm({
  ticket,
  onClose,
  onCreated,
}: {
  ticket?: SupportTicketDto;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const isEdit = !!ticket;
  const engineers = useEngineers();
  const create = useCreateSupportTicket();
  const update = useUpdateTicket();

  const openingMessage = ticket?.messages?.[0];

  const [search, setSearch] = useState("");
  const [institute, setInstitute] = useState<{ id: string; name: string } | null>(
    ticket ? { id: ticket.instituteId, name: ticket.instituteName ?? ticket.instituteId } : null
  );
  const [subject, setSubject] = useState(ticket?.subject ?? "");
  const [message, setMessage] = useState(openingMessage?.body ?? "");
  const [attachments, setAttachments] = useState<AttachmentDto[]>(openingMessage?.attachments ?? []);
  const [category, setCategory] = useState<TicketCategory>(ticket?.category ?? "QUESTION");
  const [priority, setPriority] = useState<TicketPriority>(ticket?.priority ?? "MINOR");
  const [source, setSource] = useState<TicketSource>((ticket?.source as TicketSource) ?? "MANUAL");
  const [engineerId, setEngineerId] = useState(ticket?.assignedEngineerId ?? "NONE");
  const [status, setStatus] = useState<TicketStatus>(ticket?.status ?? "OPEN");
  const [eta, setEta] = useState(toLocalInput(ticket?.eta));
  const [internalOnly, setInternalOnly] = useState(ticket?.internalOnly ?? false);
  // "" = nobody recorded. Existing tickets seed from raisedByEmail, which is only set once a
  // reporter has been attributed — support-authored ones start blank.
  const [reportedBy, setReportedBy] = useState(ticket?.raisedByEmail ?? "");

  // Only search while creating and before an institute is picked.
  const results = useInstitutes(0, 8, institute ? "" : search);
  const contacts = useInstituteContacts(institute?.id ?? null);

  // A portal raiser is often not an institute ADMIN, so they are absent from the contact list.
  // Merge them in, or the Select falls back to its placeholder and the real raiser looks unset.
  const contactOptions = (() => {
    const list = (contacts.data ?? []).filter((c) => !!c.email);
    const current = ticket?.raisedByEmail;
    if (current && !list.some((c) => c.email === current)) {
      return [{ userId: ticket?.raisedByUserId ?? null, email: current, name: ticket?.raisedByName ?? null }, ...list];
    }
    return list;
  })();

  const selectedContact = contactOptions.find((c) => c.email === reportedBy);
  // Only touch the reporter when it was actually changed. Sending it on every edit would rewrite
  // raisedBy* from the contact list and wipe the name/userId of anyone not in it.
  const reporterChanged = reportedBy !== (ticket?.raisedByEmail ?? "");

  const reporterFields = {
    reportedByUserId: selectedContact?.userId ?? undefined,
    reportedByName: selectedContact?.name ?? undefined,
    reportedByEmail: reportedBy || undefined,
  };

  const saving = create.isPending || update.isPending;
  const failed = create.isError || update.isError;
  const canSubmit = !!institute && subject.trim().length > 0 && message.trim().length > 0;

  const submit = async () => {
    if (!institute || !canSubmit) return;
    const etaIso = eta ? new Date(eta).toISOString() : null;
    try {
      if (ticket) {
        await update.mutateAsync({
          id: ticket.id,
          payload: {
            subject: subject.trim(),
            message: message.trim(),
            attachments,
            attachmentsSet: true,
            category,
            priority,
            status,
            source,
            eta: etaIso,
            etaSet: true,
            internalOnly,
            assignedEngineerId: engineerId === "NONE" ? "" : engineerId,
            ...(reporterChanged ? { ...reporterFields, reportedBySet: true } : {}),
          },
        });
        onClose();
        return;
      }
      const created = await create.mutateAsync({
        instituteId: institute.id,
        instituteName: institute.name,
        subject: subject.trim(),
        message: message.trim(),
        attachments,
        category,
        priority,
        source,
        eta: etaIso,
        internalOnly,
        assignedEngineerId: engineerId === "NONE" ? null : engineerId,
        ...reporterFields,
      });
      if (created?.id) onCreated(created.id);
      else onClose();
    } catch {
      // surfaced via `failed` below; the dialog stays open for a retry.
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* Institute */}
        <div className="space-y-1.5">
          <Label>Institute</Label>
          {institute ? (
            <div className="flex items-center justify-between rounded-md border bg-accent/40 px-3 py-2 text-sm">
              <span className="truncate font-medium">{institute.name}</span>
              {isEdit ? (
                // Moving a ticket between institutes would strand it in the wrong client's panel.
                <span className="shrink-0 text-xs text-muted-foreground">Can't be changed</span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setInstitute(null);
                    // The reporter belongs to the old institute — keeping it would attribute this
                    // ticket to someone at a different client and notify them.
                    setReportedBy("");
                  }}
                >
                  Change
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search institutes by name…"
                  className="pl-8"
                />
              </div>
              {search.trim().length > 0 ? (
                <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border p-1">
                  {results.isLoading ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (results.data?.content ?? []).length === 0 ? (
                    <p className="px-2 py-2 text-xs text-muted-foreground">No institutes found.</p>
                  ) : (
                    (results.data?.content ?? []).map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => {
                          setInstitute({ id: i.id, name: i.name });
                          setReportedBy(""); // reporters are institute-scoped
                        }}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        <span className="truncate">{i.name}</span>
                        <Check className="h-3.5 w-3.5 shrink-0 opacity-0" />
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Subject */}
        <div className="space-y-1.5">
          <Label>Subject</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Short summary of the issue"
            maxLength={200}
          />
        </div>

        {/* Message */}
        <div className="space-y-1.5">
          <Label>Issue (opening message)</Label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Paste what the client reported. They'll see this as the first message in the thread."
            className="w-full resize-none rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Attachments */}
        <div className="space-y-1.5">
          <Label>Attachments</Label>
          <AttachmentUploader value={attachments} onChange={setAttachments} />
        </div>

        {/* Reported by — decides who hears about replies */}
        <div className="space-y-1.5">
          <Label>Reported by</Label>
          <Select
            value={reportedBy || NO_REPORTER}
            onValueChange={(v) => setReportedBy(v === NO_REPORTER ? "" : v)}
            disabled={!institute || contacts.isLoading}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={institute ? "Select the person who reported it" : "Pick an institute first"}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_REPORTER}>Nobody — log against Vacademy Support</SelectItem>
              {contactOptions.map((c) => (
                <SelectItem key={c.email as string} value={c.email as string}>
                  {c.name ? `${c.name} · ${c.email}` : c.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {reportedBy
              ? "They'll get an email and an in-app alert whenever support replies."
              : contacts.isError
                ? "Couldn't load this institute's users — the ticket will be logged against Vacademy Support."
                : "Nobody is notified when support replies unless you pick the person who reported it."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MAJOR">Major</SelectItem>
                <SelectItem value="MINOR">Minor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select value={source} onValueChange={(v) => setSource(v as TicketSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Assign to (optional)</Label>
            <Select value={engineerId} onValueChange={setEngineerId}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Unassigned</SelectItem>
                {(engineers.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* A new ticket always starts Open, so only offer status when editing. */}
          {isEdit ? (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TicketStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        {/* ETA */}
        <div className="space-y-1.5">
          <Label>Expected resolution (ETA — optional)</Label>
          <Input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Shown to the institute as “Expected by …”. Leave blank if not committing to a date.
          </p>
        </div>

        {/* Internal-only */}
        <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
          <input
            type="checkbox"
            checked={internalOnly}
            onChange={(e) => setInternalOnly(e.target.checked)}
            className="mt-0.5"
          />
          <span className="space-y-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Lock className="h-3.5 w-3.5" /> Internal only
            </span>
            <span className="block text-xs text-muted-foreground">
              Hidden from the institute completely — it won't appear in their support panel or their
              open-issue count. Use for work you track on their account but don't want to share.
            </span>
          </span>
        </label>
      </div>

      <DialogFooter>
        {failed ? (
          <p className="mr-auto self-center text-xs text-destructive">
            Could not save the ticket. Try again.
          </p>
        ) : isEdit && ticket ? (
          // Everything is editable here; this is just the escape hatch to the message thread.
          <Button asChild variant="ghost" size="sm" className="mr-auto text-muted-foreground">
            <Link to={`/support?ticket=${ticket.id}`}>
              <MessagesSquare className="mr-1 h-4 w-4" /> Open conversation
            </Link>
          </Button>
        ) : null}
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!canSubmit || saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {isEdit ? "Save changes" : "Create ticket"}
        </Button>
      </DialogFooter>
    </>
  );
}
