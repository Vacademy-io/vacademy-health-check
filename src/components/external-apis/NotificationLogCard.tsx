import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNotificationLogDetail, useNotificationLogs } from "@/services/external-apis-api";
import { useInstitutes } from "@/services/institutes-api";
import { dateTime, optionsFrom } from "./format";
import { ErrorNote, FilterSelect, JsonBlock, Pager } from "./parts";

export function NotificationLogCard({ hours }: { hours: number }) {
  const [instituteId, setInstituteId] = useState<string | undefined>();
  const [notificationType, setNotificationType] = useState<string | undefined>();
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const institutes = useInstitutes(0, 200, "");
  const logs = useNotificationLogs(instituteId, hours, notificationType, page);
  const detail = useNotificationLogDetail(openId);
  const rows = logs.data?.content ?? [];

  const instituteOptions = useMemo(
    () => (institutes.data?.content ?? []) as Array<{ id: string; name?: string; institute_name?: string }>,
    [institutes.data],
  );

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Email and WhatsApp sends</CardTitle>
          <p className="text-xs text-muted-foreground">
            Delivery status per message. Vendor responses are not stored, and message text that is not JSON is withheld because it can hold OTPs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={instituteId ?? ""} onValueChange={(v) => { setPage(0); setInstituteId(v); }}>
            <SelectTrigger className="w-56" aria-label="Institute"><SelectValue placeholder="Choose an institute" /></SelectTrigger>
            <SelectContent>
              {instituteOptions.map((i) => <SelectItem key={i.id} value={i.id}>{i.name ?? i.institute_name ?? i.id}</SelectItem>)}
            </SelectContent>
          </Select>
          <FilterSelect
            label="Type"
            value={notificationType}
            onChange={(v) => { setPage(0); setNotificationType(v); }}
            options={optionsFrom(rows.map((r) => r.notificationType), notificationType)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {!instituteId ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Choose an institute to see its sends</p>
        ) : logs.isError ? (
          <ErrorNote title="Could not load sends. The notification-service endpoint may not be deployed yet." error={logs.error} />
        ) : logs.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <TableCell className="whitespace-nowrap text-xs">{r.notificationDate ? dateTime(r.notificationDate) : "—"}</TableCell>
                    <TableCell className="text-xs">{r.notificationType}</TableCell>
                    <TableCell className="text-xs">{r.source ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{r.deliveryStatus ?? "No status yet"}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {[r.deliveryErrorCode, r.deliveryErrorMessage].filter(Boolean).join(": ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} hasNext={page + 1 < (logs.data?.totalPages ?? 0)} onPage={setPage} />
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No sends in this window</p>
        )}
      </CardContent>

      <Dialog open={openId != null} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Message send</DialogTitle></DialogHeader>
          {detail.isError ? (
            <ErrorNote title="Could not load this send" error={detail.error} />
          ) : detail.isLoading || !detail.data ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="space-y-4">
              <JsonBlock title="Payload" body={detail.data.payload} empty="No payload stored" />
              <JsonBlock title="Message" body={detail.data.body} empty="No message stored" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
