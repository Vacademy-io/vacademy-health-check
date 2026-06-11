import { useRef, useState } from "react";
import { useUploadFile } from "@/services/files-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UploadedFileDTO } from "@/types/api";
import { formatBytes, FileTypeIcon } from "@/lib/file-utils";
import { Check, Copy, ExternalLink, UploadCloud } from "lucide-react";

type Visibility = "PRIVATE" | "PUBLIC";

interface UploadEntry {
  id: number;
  name: string;
  size: number;
  visibility: Visibility;
  status: "uploading" | "done" | "error";
  progress: number;
  result?: UploadedFileDTO;
  error?: string;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs" title={value}>
        {value}
      </code>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

export default function FileUploadPage() {
  const [visibility, setVisibility] = useState<Visibility>("PRIVATE");
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextEntryId = useRef(0);
  const uploadMutation = useUploadFile();

  function patchEntry(id: number, patch: Partial<UploadEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function uploadFiles(files: FileList | File[]) {
    const queued = Array.from(files).map((file) => ({ file, id: nextEntryId.current++ }));
    setEntries((prev) => [
      ...prev,
      ...queued.map(({ file, id }) => ({
        id,
        name: file.name,
        size: file.size,
        visibility,
        status: "uploading" as const,
        progress: 0,
      })),
    ]);
    queued.forEach(({ file, id }) => {
      uploadMutation.mutate(
        {
          file,
          visibility,
          onProgress: (percent) => patchEntry(id, { progress: percent }),
        },
        {
          onSuccess: (result) => patchEntry(id, { status: "done", progress: 100, result }),
          onError: (error) =>
            patchEntry(id, {
              status: "error",
              error: error instanceof Error ? error.message : "Upload failed",
            }),
        }
      );
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload File"
        description="Upload a file to media service and get its file ID"
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">New upload</CardTitle>
            <Tabs value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
              <TabsList>
                <TabsTrigger value="PRIVATE">Private (presigned links)</TabsTrigger>
                <TabsTrigger value="PUBLIC">Public (permanent URL)</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
            }}
          >
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">Drop files here or click to browse</p>
            <p className="text-xs text-muted-foreground">
              Max 20 MB per file · {visibility === "PUBLIC" ? "Public: anyone with the URL can access" : "Private: links expire and are regenerated on demand"}
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </CardContent>
      </Card>

      {entries.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Uploads this session</h2>
          {[...entries]
            .reverse()
            .map((entry) => {
              return (
                <Card key={entry.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center gap-3">
                      <FileTypeIcon
                        fileType={entry.result?.file_type ?? null}
                        className="h-8 w-8 shrink-0 text-muted-foreground"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium" title={entry.name}>
                          {entry.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatBytes(entry.size)}</p>
                      </div>
                      <Badge variant="outline">{entry.visibility}</Badge>
                      {entry.status === "done" && (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Uploaded
                        </Badge>
                      )}
                      {entry.status === "error" && <Badge variant="destructive">Failed</Badge>}
                    </div>

                    {entry.status === "uploading" && <Progress value={entry.progress} />}

                    {entry.status === "error" && (
                      <p className="text-sm text-destructive">{entry.error}</p>
                    )}

                    {entry.status === "done" && entry.result && (
                      <div className="space-y-2">
                        <CopyField label="File ID" value={entry.result.id} />
                        {entry.result.url && (
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <CopyField label="URL" value={entry.result.url} />
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7"
                              onClick={() => window.open(entry.result!.url!, "_blank")}
                            >
                              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
