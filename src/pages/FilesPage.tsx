import { useState } from "react";
import { useFilesSearch, useDeleteFile, type FileSearchParams } from "@/services/files-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FileItemDTO } from "@/types/api";
import {
  formatBytes,
  formatDateTime,
  FileTypeIcon,
  isImage,
  FILE_TYPE_FILTERS,
} from "@/lib/file-utils";
import {
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  LayoutGrid,
  List,
  Trash2,
  X,
} from "lucide-react";

const DATE_PRESETS = [
  { value: "ANY", label: "Any time" },
  { value: "TODAY", label: "Today" },
  { value: "7D", label: "Last 7 days" },
  { value: "30D", label: "Last 30 days" },
  { value: "90D", label: "Last 90 days" },
  { value: "CUSTOM", label: "Custom range" },
] as const;

type DatePreset = (typeof DATE_PRESETS)[number]["value"];

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function presetRange(preset: DatePreset): { from: string; to: string } {
  const today = new Date();
  const to = toDateInputValue(today);
  const days = preset === "TODAY" ? 0 : preset === "7D" ? 7 : preset === "30D" ? 30 : 90;
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  return { from: toDateInputValue(from), to };
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2"
      title={label ?? "Copy"}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      {label && <span className="ml-1">{copied ? "Copied" : label}</span>}
    </Button>
  );
}

function FileThumb({ file, className }: { file: FileItemDTO; className?: string }) {
  if (isImage(file.file_type) && file.url) {
    return (
      <img
        src={file.url}
        alt={file.file_name ?? ""}
        loading="lazy"
        className={`object-cover ${className ?? ""}`}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div className={`flex items-center justify-center bg-muted ${className ?? ""}`}>
      <FileTypeIcon fileType={file.file_type} className="h-1/3 w-1/3 text-muted-foreground" />
    </div>
  );
}

function FilePreview({ file }: { file: FileItemDTO }) {
  const type = (file.file_type || "").toLowerCase();
  if (!file.url) {
    return <EmptyState title="No URL available for this file" />;
  }
  if (type.startsWith("image/")) {
    return <img src={file.url} alt={file.file_name ?? ""} className="max-h-80 w-full rounded-md object-contain bg-muted" />;
  }
  if (type.startsWith("video/")) {
    return <video src={file.url} controls className="max-h-80 w-full rounded-md bg-black" />;
  }
  if (type.startsWith("audio/")) {
    return <audio src={file.url} controls className="w-full" />;
  }
  if (type === "application/pdf") {
    return <iframe src={file.url} title={file.file_name ?? "PDF preview"} className="h-80 w-full rounded-md border" />;
  }
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md bg-muted">
      <FileTypeIcon fileType={file.file_type} className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">No inline preview for this type</p>
    </div>
  );
}

function DetailRow({ label, value, copyable }: { label: string; value: string | null; copyable?: boolean }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-start justify-end gap-1 text-sm">
        <span className="break-all text-right font-mono text-xs leading-5" title={value ?? undefined}>
          {value || "-"}
        </span>
        {copyable && value && <CopyButton value={value} />}
      </span>
    </div>
  );
}

export default function FilesPage() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [fileType, setFileType] = useState("");
  const [source, setSource] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("ANY");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortDirection, setSortDirection] = useState<"ASC" | "DESC">("DESC");
  const [view, setView] = useState<"list" | "grid">("list");
  const [detailFile, setDetailFile] = useState<FileItemDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileItemDTO | null>(null);
  const pageSize = 24;

  const params: FileSearchParams = {
    page,
    size: pageSize,
    search,
    fileType,
    source,
    sourceId,
    startDate: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
    endDate: toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : undefined,
    sortBy,
    sortDirection,
  };

  const { data, isLoading } = useFilesSearch(params);
  const deleteMutation = useDeleteFile();

  const hasFilters = !!(search || fileType || source || sourceId || fromDate || toDate);

  function resetPageAnd<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  function clearFilters() {
    setSearch("");
    setFileType("");
    setSource("");
    setSourceId("");
    setDatePreset("ANY");
    setFromDate("");
    setToDate("");
    setPage(0);
  }

  function applyDatePreset(preset: DatePreset) {
    setDatePreset(preset);
    if (preset === "ANY") {
      setFromDate("");
      setToDate("");
    } else if (preset !== "CUSTOM") {
      const { from, to } = presetRange(preset);
      setFromDate(from);
      setToDate(to);
    }
    setPage(0);
  }

  function handleSort(key: string) {
    if (sortBy === key) {
      setSortDirection((d) => (d === "ASC" ? "DESC" : "ASC"));
    } else {
      setSortBy(key);
      setSortDirection("DESC");
    }
    setPage(0);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        setDetailFile(null);
      },
    });
  }

  const columns: Column<FileItemDTO & Record<string, unknown>>[] = [
    {
      key: "preview",
      header: "",
      className: "w-12",
      render: (row) => <FileThumb file={row} className="h-9 w-9 rounded" />,
    },
    {
      key: "file_name",
      header: "Name",
      sortable: true,
      render: (row) => (
        <span className="block max-w-64 truncate font-medium" title={row.file_name ?? undefined}>
          {row.file_name || "-"}
        </span>
      ),
    },
    {
      key: "file_type",
      header: "Type",
      sortable: true,
      render: (row) =>
        row.file_type ? <Badge variant="outline">{row.file_type}</Badge> : "-",
    },
    {
      key: "file_size",
      header: "Size",
      className: "text-right",
      sortable: true,
      render: (row) => formatBytes(row.file_size),
    },
    { key: "source", header: "Source", render: (row) => row.source || "-" },
    {
      key: "source_id",
      header: "Source ID",
      render: (row) => (
        <span className="block max-w-36 truncate font-mono text-xs" title={row.source_id ?? undefined}>
          {row.source_id || "-"}
        </span>
      ),
    },
    {
      key: "created_on",
      header: "Created",
      sortable: true,
      render: (row) => formatDateTime(row.created_on),
    },
    {
      key: "actions",
      header: "",
      className: "w-28",
      render: (row) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <CopyButton value={row.id} label="ID" />
          {row.url && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              title="Open file"
              onClick={() => window.open(row.url!, "_blank")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-destructive"
            title="Delete file"
            onClick={() => setDeleteTarget(row)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        value={search}
        onChange={resetPageAnd(setSearch)}
        placeholder="Search name, key, or file ID..."
      />
      <Select
        value={fileType || "ALL"}
        onValueChange={(v) => resetPageAnd(setFileType)(v === "ALL" ? "" : v)}
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder="All Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All Types</SelectItem>
          {FILE_TYPE_FILTERS.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={source}
        onChange={(e) => resetPageAnd(setSource)(e.target.value)}
        placeholder="Source (e.g. BBB_RECORDING)"
        className="w-52"
      />
      <Input
        value={sourceId}
        onChange={(e) => resetPageAnd(setSourceId)(e.target.value)}
        placeholder="Source ID"
        className="w-36"
      />
      <Select value={datePreset} onValueChange={(v) => applyDatePreset(v as DatePreset)}>
        {/* div, not span: SelectTrigger carries [&>span]:line-clamp-1, and line-clamp sets
            display:-webkit-box, which overrides flex and stacks the icon above the label. */}
        <SelectTrigger className="w-40">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          {DATE_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {datePreset !== "ANY" && (
        <div className="flex items-center gap-1.5 rounded-md border px-2 py-1">
          <Input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => {
              setDatePreset("CUSTOM");
              resetPageAnd(setFromDate)(e.target.value);
            }}
            className="h-7 w-36 border-0 p-1 shadow-none focus-visible:ring-0"
            title="Created from"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => {
              setDatePreset("CUSTOM");
              resetPageAnd(setToDate)(e.target.value);
            }}
            className="h-7 w-36 border-0 p-1 shadow-none focus-visible:ring-0"
            title="Created until"
          />
        </div>
      )}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="mr-1 h-4 w-4" /> Clear
        </Button>
      )}
      <div className="ml-auto flex items-center rounded-md border">
        <Button
          variant={view === "list" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-r-none"
          onClick={() => setView("list")}
          title="List view"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant={view === "grid" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-l-none"
          onClick={() => setView("grid")}
          title="Thumbnail view"
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const files = data?.content ?? [];
  const totalPages = data?.total_pages ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Files"
        description="Search files stored in media service by name, type, source, and date"
      />

      {view === "list" ? (
        <DataTable
          data={files as (FileItemDTO & Record<string, unknown>)[]}
          columns={columns}
          page={page}
          totalPages={totalPages}
          totalItems={data?.total_elements}
          onPageChange={setPage}
          isLoading={isLoading}
          onRowClick={(row) => setDetailFile(row)}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
          toolbar={toolbar}
        />
      ) : (
        <div className="space-y-4">
          {toolbar}
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full" />
              ))}
            </div>
          ) : files.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {files.map((file) => (
                <button
                  key={file.id}
                  className="group overflow-hidden rounded-lg border text-left transition-colors hover:border-primary"
                  onClick={() => setDetailFile(file)}
                >
                  <FileThumb file={file} className="aspect-square w-full" />
                  <div className="space-y-0.5 p-2">
                    <p className="truncate text-sm font-medium" title={file.file_name ?? undefined}>
                      {file.file_name || "-"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatBytes(file.file_size)} · {formatDateTime(file.created_on)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
                {data?.total_elements !== undefined &&
                  ` (${data.total_elements.toLocaleString()} total)`}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* File detail dialog */}
      <Dialog open={!!detailFile} onOpenChange={(open) => !open && setDetailFile(null)}>
        <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
          {detailFile && (
            <>
              <DialogHeader>
                <DialogTitle className="break-all pr-6">{detailFile.file_name || "File details"}</DialogTitle>
                <DialogDescription>{detailFile.file_type || "Unknown type"}</DialogDescription>
              </DialogHeader>
              <FilePreview file={detailFile} />
              <div className="min-w-0 divide-y">
                <DetailRow label="File ID" value={detailFile.id} copyable />
                <DetailRow label="S3 Key" value={detailFile.key} copyable />
                <DetailRow label="Size" value={formatBytes(detailFile.file_size)} />
                <DetailRow label="Source" value={detailFile.source} />
                <DetailRow label="Source ID" value={detailFile.source_id} copyable />
                {detailFile.width != null && detailFile.height != null && (
                  <DetailRow label="Dimensions" value={`${detailFile.width} × ${detailFile.height}`} />
                )}
                <DetailRow label="Created" value={formatDateTime(detailFile.created_on)} />
                <DetailRow label="Updated" value={formatDateTime(detailFile.updated_on)} />
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setDeleteTarget(detailFile)}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
                <div className="flex items-center gap-2">
                  {detailFile.url && (
                    <>
                      <CopyButton value={detailFile.url} label="Copy URL" />
                      <Button variant="outline" onClick={() => window.open(detailFile.url!, "_blank")}>
                        <ExternalLink className="mr-1 h-4 w-4" /> Open
                      </Button>
                    </>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete file?</DialogTitle>
            <DialogDescription>
              This permanently deletes <span className="font-medium">{deleteTarget?.file_name || deleteTarget?.id}</span>{" "}
              from S3 and removes its metadata. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={confirmDelete}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
