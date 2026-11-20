/** PAYMENT_PENDING: a "Buy <plan>" sign-up waiting for its first payment (no trial). */
export type TrialStatus = "ON_TRIAL" | "EXPIRED" | "PAID" | "PAYMENT_PENDING" | "NOT_ON_TRIAL";

export type StatusBadge = { label: string; variant: "secondary" | "outline" | "destructive" };

const STATUS: Record<TrialStatus, StatusBadge> = {
  ON_TRIAL: { label: "On trial", variant: "secondary" },
  EXPIRED: { label: "Trial ended", variant: "destructive" },
  PAID: { label: "Paid", variant: "outline" },
  // A "Buy <plan>" sign-up: no trial, waiting for its first payment.
  PAYMENT_PENDING: { label: "Payment pending", variant: "outline" },
  NOT_ON_TRIAL: { label: "No trial", variant: "outline" },
};

/** The badge for a sign-up's status. A status this dashboard does not know yet shows as it is, never breaks the table. */
export function statusBadge(status: string | null | undefined): StatusBadge {
  return STATUS[status as TrialStatus] ?? { label: status || "-", variant: "outline" };
}

/** The status filter on the sign-ups list ("" = all). */
export const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "ON_TRIAL", label: "On trial" },
  { value: "EXPIRED", label: "Trial ended" },
  { value: "PAID", label: "Paid" },
  { value: "PAYMENT_PENDING", label: "Payment pending" },
];
