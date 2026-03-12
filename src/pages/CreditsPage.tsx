import { useState } from "react";
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
import { ArrowUpDown } from "lucide-react";
import type { InstituteCreditItem } from "@/types/api";

export default function CreditsPage() {
  const navigate = useNavigate();
  // AI service uses 1-indexed pages
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("current_balance");
  const [sortDir, setSortDir] = useState("ASC");
  const pageSize = 20;

  const { data, isLoading } = useAllCredits(page, pageSize, sortBy, sortDir);

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
      <PageHeader title="Credits" description="Credit balances across all institutes" />
      <DataTable
        data={(data?.items as (InstituteCreditItem & Record<string, unknown>)[]) ?? []}
        columns={columns}
        page={displayPage}
        totalPages={totalPages}
        totalItems={data?.total}
        onPageChange={(p) => setPage(p + 1)}
        isLoading={isLoading}
        onRowClick={(row) => navigate(`/institutes/${row.institute_id}`)}
        toolbar={
          <div className="flex items-center gap-2">
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
    </div>
  );
}
