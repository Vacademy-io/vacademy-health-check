import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SearchInput } from "@/components/shared/SearchInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useChangeTrial,
  useProductInstitutes,
  type ProductInstitute,
  type TrialStatus,
} from "@/services/products-api";
import { errorText } from "./errors";

const STATUS: Record<TrialStatus, { label: string; variant: "secondary" | "outline" | "destructive" }> = {
  ON_TRIAL: { label: "On trial", variant: "secondary" },
  EXPIRED: { label: "Trial ended", variant: "destructive" },
  PAID: { label: "Paid", variant: "outline" },
  NOT_ON_TRIAL: { label: "No trial", variant: "outline" },
  PAYMENT_PENDING: { label: "Payment pending", variant: "destructive" },
};

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "ON_TRIAL", label: "On trial" },
  { value: "EXPIRED", label: "Trial ended" },
  { value: "PAID", label: "Paid" },
  { value: "PAYMENT_PENDING", label: "Payment pending" },
];

const dateText = (value: string | null) =>
  value ? new Date(`${value}Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "-";

const canExtend = (row: ProductInstitute) => row.trial_status === "ON_TRIAL" || row.trial_status === "EXPIRED";

function ExtendTrialDialog({
  productKey,
  institute,
  onClose,
}: {
  productKey: string;
  institute: ProductInstitute;
  onClose: () => void;
}) {
  const [days, setDays] = useState("3");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const change = useChangeTrial(productKey);
  const dayCount = Number(days);
  const valid = date !== "" || (Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 365);

  const save = () => {
    setError(null);
    change.mutate(
      date ? { instituteId: institute.id, ends_on: date } : { instituteId: institute.id, extend_days: dayCount },
      { onSuccess: onClose, onError: (e) => setError(errorText(e)) }
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend trial</DialogTitle>
          <DialogDescription>
            {institute.name}. {institute.trial_status === "EXPIRED" ? "Ended" : "Ends"} {dateText(institute.trial_ends_at)}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="extend-days">Days to add</Label>
            <Input
              id="extend-days"
              type="number"
              min={1}
              max={365}
              value={days}
              disabled={date !== ""}
              onChange={(e) => setDays(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Counted from today if the trial has ended.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="extend-date">Or end on this date</Label>
            <Input id="extend-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {error && (
          <p role="alert" className="flex items-center gap-1 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid || change.isPending}>
            {change.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Everyone who signed up for this product, and their trial. */
export function ProductSignupsTab({ productKey }: { productKey: string }) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [extending, setExtending] = useState<ProductInstitute | null>(null);
  const list = useProductInstitutes(productKey, page, search, status);

  useEffect(() => setPage(0), [search, status]);

  const columns: Column<ProductInstitute & Record<string, unknown>>[] = [
    {
      key: "name",
      header: "Institute",
      render: (row) => (
        <Link to={`/institutes/${row.id}`} className="font-medium hover:underline">
          {row.name}
        </Link>
      ),
    },
    { key: "email", header: "Email" },
    { key: "phone", header: "Phone", render: (row) => row.phone || "-" },
    { key: "created_at", header: "Signed up", render: (row) => dateText(row.created_at) },
    {
      key: "trial_status",
      header: "Status",
      render: (row) => <Badge variant={STATUS[row.trial_status].variant}>{STATUS[row.trial_status].label}</Badge>,
    },
    { key: "trial_ends_at", header: "Trial ends", render: (row) => dateText(row.trial_ends_at) },
    {
      key: "credit_balance",
      header: "Credits left",
      className: "text-right",
      render: (row) => (row.credit_balance == null ? "-" : Number(row.credit_balance).toLocaleString()),
    },
    {
      key: "actions",
      header: "",
      render: (row) =>
        canExtend(row) ? (
          <Button variant="outline" size="sm" onClick={() => setExtending(row)}>
            Extend trial
          </Button>
        ) : null,
    },
  ];

  const total = list.data?.total ?? 0;
  const size = list.data?.size ?? 20;

  return (
    <div className="space-y-3">
      {list.isError ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> The sign-ups could not be loaded.
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </p>
      ) : (
        <DataTable
          data={(list.data?.content ?? []) as (ProductInstitute & Record<string, unknown>)[]}
          columns={columns}
          page={page}
          totalPages={Math.ceil(total / size)}
          totalItems={total}
          onPageChange={setPage}
          isLoading={list.isLoading}
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Search name, email or phone" />
              {FILTERS.map((filter) => (
                <Button
                  key={filter.value}
                  size="sm"
                  variant={status === filter.value ? "default" : "outline"}
                  onClick={() => setStatus(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          }
        />
      )}
      <p className="text-xs text-muted-foreground">
        Giving credits from an institute's page ends its trial for good, the same as buying them.
      </p>
      {extending && (
        <ExtendTrialDialog productKey={productKey} institute={extending} onClose={() => setExtending(null)} />
      )}
    </div>
  );
}
