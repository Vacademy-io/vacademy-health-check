import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAllCredits } from "@/services/credits-api";
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
import { ArrowUpDown, PlugZap } from "lucide-react";
import { SearchInput } from "@/components/shared/SearchInput";
import { ToastStack, useToasts } from "@/components/shared/Toast";
import { BulkEnableApiDialog } from "@/components/institute-pricing/BulkEnableApiDialog";
import { useToolPricingOverrides } from "@/services/institute-pricing-api";
import { useInstituteApiAccess } from "@/services/api-access-api";
import { overriddenToolsByInstitute, toolLabel } from "@/lib/eval-api-pricing";
import type { InstituteCreditItem } from "@/types/api";

/**
 * 30-day API spend for one row. Uses the list's own `api_spend_30d` when ai-service
 * returns it; otherwise asks admin-core's api-access endpoint for that institute
 * (cached 5 minutes, no retry), which only the visible page triggers.
 */
function ApiSpendCell({ row }: { row: InstituteCreditItem }) {
  const inline = typeof row.api_spend_30d === "number" ? row.api_spend_30d : null;
  const { data, isLoading, isError } = useInstituteApiAccess(row.institute_id, {
    enabled: inline === null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const credits = inline ?? data?.usage_30d?.credits ?? null;
  if (inline === null && isLoading) return <span className="text-muted-foreground">…</span>;
  if (inline === null && isError) return <span className="text-muted-foreground" title="Could not load">—</span>;
  if (!credits) return <span className="text-muted-foreground">—</span>;
  return <span>{Number(credits).toFixed(2)}</span>;
}

export default function CreditsPage() {
  const navigate = useNavigate();
  // AI service uses 1-indexed pages
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("current_balance");
  const [sortDir, setSortDir] = useState("ASC");
  const pageSize = 20;

  const { data, isLoading } = useAllCredits(page, pageSize, sortBy, sortDir, search);
  const overrides = useToolPricingOverrides();
  const customByInstitute = useMemo(() => overriddenToolsByInstitute(overrides.data ?? []), [overrides.data]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  const columns: Column<InstituteCreditItem & Record<string, unknown>>[] = [
    {
      key: "institute_id",
      header: "Institute ID",
      render: (r) => <span className="max-w-[200px] truncate text-xs font-mono">{r.institute_id}</span>,
    },
    {
      key: "total_credits",
      header: "Total",
      className: "text-right",
      render: (r) => Number(r.total_credits).toFixed(2),
    },
    {
      key: "used_credits",
      header: "Used",
      className: "text-right",
      render: (r) => Number(r.used_credits).toFixed(2),
    },
    {
      key: "current_balance",
      header: "Balance",
      className: "text-right font-medium",
      render: (r) => Number(r.current_balance).toFixed(2),
    },
    {
      key: "custom_pricing",
      header: "Pricing",
      render: (r) => {
        const tools = customByInstitute[r.institute_id];
        if (!tools || tools.length === 0) return <span className="text-xs text-muted-foreground">Standard</span>;
        return (
          <Badge variant="default" title={tools.map((t) => toolLabel(t)).join("\n")}>
            Custom pricing
          </Badge>
        );
      },
    },
    {
      key: "api_spend_30d",
      header: "API spend 30d",
      className: "text-right",
      render: (r) => <ApiSpendCell row={r} />,
    },
    {
      key: "is_low_balance",
      header: "Status",
      render: (r) =>
        r.is_low_balance ? (
          <Badge variant="destructive">Low Balance</Badge>
        ) : (
          <Badge variant="secondary">OK</Badge>
        ),
    },
  ];

  // Convert 1-indexed (AI service) to 0-indexed for DataTable display
  const displayPage = page - 1;
  const totalPages = data?.total_pages ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credits"
        description="Credit balances across all institutes. Custom pricing = a contract price on at least one tool; API spend = credits charged to API keys in the last 30 days."
        actions={
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
            <PlugZap className="mr-2 h-4 w-4" />
            {selected.size > 0 ? `Enable API for ${selected.size} selected` : "Enable Evaluation API"}
          </Button>
        }
      />
      <DataTable
        data={(data?.items as (InstituteCreditItem & Record<string, unknown>)[]) ?? []}
        columns={columns}
        page={displayPage}
        totalPages={totalPages}
        totalItems={data?.total}
        onPageChange={(p) => setPage(p + 1)}
        isLoading={isLoading}
        onRowClick={(row) => navigate(`/institutes/${row.institute_id}`)}
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
        rowId={(row) => row.institute_id}
        toolbar={
          <div className="flex items-center gap-2">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by institute ID..."
            />
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_balance">Balance</SelectItem>
                <SelectItem value="total_credits">Total Credits</SelectItem>
                <SelectItem value="used_credits">Used Credits</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSortDir(sortDir === "ASC" ? "DESC" : "ASC")}
              title={sortDir === "ASC" ? "Ascending" : "Descending"}
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>
        }
      />
      <BulkEnableApiDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        initialIds={Array.from(selected)}
        onDone={(text) => {
          setSelected(new Set());
          push("success", text);
        }}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
