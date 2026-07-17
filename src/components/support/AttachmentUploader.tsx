import { useRef, useState } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchFileUrl, useUploadFile } from "@/services/files-api";
import type { AttachmentDto } from "@/services/support-api";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — matches the institute-side raise-issue limit.

function isImage(a: AttachmentDto): boolean {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(a.fileName ?? "");
}

/**
 * Attach images/files to a ticket. Uploads to media-service (public) and hands back the
 * `{fileId, fileName, url}` descriptors the support API stores on the ticket's opening message.
 */
export function AttachmentUploader({
  value,
  onChange,
}: {
  value: AttachmentDto[];
  onChange: (next: AttachmentDto[]) => void;
}) {
  const upload = useUploadFile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);

  const addFiles = async (files: FileList) => {
    setError(null);
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        setError(`${file.name} exceeds the 50 MB limit.`);
        continue;
      }
      setBusy((n) => n + 1);
      try {
        const result = await upload.mutateAsync({ file, visibility: "PUBLIC" });
        // The upload response usually carries a URL; fall back to resolving it by id.
        const url = result.url ?? (await fetchFileUrl(result.id).catch(() => null));
        onChange([
          ...value,
          { fileId: result.id, fileName: result.file_name ?? file.name, url: url ?? undefined },
        ]);
      } catch {
        setError(`Could not upload ${file.name}.`);
      } finally {
        setBusy((n) => n - 1);
      }
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void addFiles(e.target.files);
          e.target.value = ""; // let the same file be re-picked after a remove
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={busy > 0}
      >
        {busy > 0 ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Paperclip className="mr-1 h-4 w-4" />
        )}
        {busy > 0 ? "Uploading…" : "Attach images or files"}
      </Button>

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((a, i) => (
            <li
              key={a.fileId ?? i}
              className="flex items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-1.5 pr-1 text-xs"
            >
              {isImage(a) && a.url ? (
                <img src={a.url} alt="" className="h-6 w-6 rounded object-cover" />
              ) : (
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="max-w-[10rem] truncate">{a.fileName ?? "attachment"}</span>
              <button
                type="button"
                aria-label={`Remove ${a.fileName ?? "attachment"}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
