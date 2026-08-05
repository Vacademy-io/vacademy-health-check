import { useRef } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MEDIA_ONLY,
  useAttachmentUpload,
  type AttachmentUploadController,
} from "@/hooks/use-attachment-upload";
import type { AttachmentDto } from "@/services/support-api";

function isImage(a: AttachmentDto): boolean {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(a.fileName ?? "");
}

interface ViewProps {
  value: AttachmentDto[];
  onChange: (next: AttachmentDto[]) => void;
  uploader: AttachmentUploadController;
  /** e.g. `MEDIA_ONLY`. Omitted means any file type. */
  accept?: string;
  label?: string;
}

/** The paperclip button plus the pending-attachment chips, driven by an external controller. */
export function AttachmentUploaderView({ value, onChange, uploader, accept, label }: ViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { addFiles, busy, error } = uploader;
  const buttonLabel =
    label ?? (accept === MEDIA_ONLY ? "Attach image or video" : "Attach images or files");

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
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
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Paperclip className="mr-1 h-4 w-4" />
        )}
        {busy ? "Uploading…" : buttonLabel}
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

/** Self-contained uploader for hosts that don't need to trigger uploads themselves. */
export function AttachmentUploader(props: Omit<ViewProps, "uploader">) {
  const uploader = useAttachmentUpload(props);
  return <AttachmentUploaderView {...props} uploader={uploader} />;
}
