import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInstitutes, useBulkUpdateLeadTag } from "@/services/institutes-api";
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
import { LEAD_TAG_OPTIONS } from "@/types/api";
import type { InstituteListItemDTO, LeadTag } from "@/types/api";
import { Tag, X } from "lucide-react";

const TAG_COLORS: Record<string, string> = {
  PROD: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  LEAD: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  TEST: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  FREE_TRIAL: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

const columns: Column<InstituteListItemDTO & Record<string, unknown>>[] = [
  { key: "name", header: "Name", render: (row) => <span className="font-medium">{row.name}</span> },
  { key: "email", header: "Email" },
  {
    key: "location",
    header: "Location",
    render: (row) => [row.city, row.state].filter(Boolean).join(", ") || "-",
  },
  {
    key: "lead_tag",
    header: "Tag",
    render: (row) =>
      row.lead_tag ? (
        <Badge variant="outline" className={TAG_COLORS[row.lead_tag] || ""}>
          {row.lead_tag}
        </Badge>
      ) : (
        "-"
      ),
  },
  { key: "subdomain", header: "Subdomain" },
  { key: "student_count", header: "Students", className: "text-right", sortable: true },
  { key: "course_count", header: "Courses", className: "text-right", sortable: true },
  { key: "batch_count", header: "Batches", className: "text-right", sortable: true },
  {
    key: "created_at",
    header: "Created",
    render: (row) =>
      row.created_at ? new Date(row.created_at as string).toLocaleDateString() : "-",
  },
];

export default function InstitutesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortDirection, setSortDirection] = useState<"ASC" | "DESC">("DESC");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pageSize = 20;

  const { data, isLoading } = useInstitutes(page, pageSize, search, tagFilter, sortBy, sortDirection);
  const bulkTagMutation = useBulkUpdateLeadTag();

  function handleSort(key: string) {
    if (sortBy === key) {
      setSortDirection((d) => (d === "ASC" ? "DESC" : "ASC"));
    } else {
      setSortBy(key);
      setSortDirection("DESC");
    }
    setPage(0);
  }

  function handleBulkTagUpdate(tag: LeadTag) {
    bulkTagMutation.mutate(
      { instituteIds: Array.from(selectedIds), leadTag: tag },
      { onSuccess: () => setSelectedIds(new Set()) }
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Institutes" description="All registered institutes on the platform" />

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <Select
              onValueChange={(v) => handleBulkTagUpdate(v as LeadTag)}
              disabled={bulkTagMutation.isPending}
            >
              <SelectTrigger className="w-36 h-8">
                <SelectValue placeholder={bulkTagMutation.isPending ? "Updating..." : "Set Tag"} />
              </SelectTrigger>
              <SelectContent>
                {LEAD_TAG_OPTIONS.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto"
          >
            <X className="mr-1 h-4 w-4" /> Clear
          </Button>
        </div>
      )}

      <DataTable
        data={(data?.content as (InstituteListItemDTO & Record<string, unknown>)[]) ?? []}
        columns={columns}
        page={page}
        totalPages={data?.total_pages ?? 0}
        totalItems={data?.total_elements}
        onPageChange={setPage}
        isLoading={isLoading}
        onRowClick={(row) => navigate(`/institutes/${row.id}`)}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={handleSort}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        rowId={(row) => row.id as string}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(0);
              }}
              placeholder="Search institutes..."
            />
            <Select
              value={tagFilter || "ALL"}
              onValueChange={(v) => {
                setTagFilter(v === "ALL" ? "" : v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Tags</SelectItem>
                {LEAD_TAG_OPTIONS.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
    </div>
  );
}
