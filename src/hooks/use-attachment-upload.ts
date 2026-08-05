import { useState } from "react";
import { fetchFileUrl, useUploadFile } from "@/services/files-api";
import type { AttachmentDto } from "@/services/support-api";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — matches the institute-side raise-issue limit.

/** Restricts the chat composer to what the institute side also accepts. */
export const MEDIA_ONLY = "image/*,video/*";

/**
 * Enforce an `accept` list of the `type/*` form. An input's own `accept` attribute is only a
 * file-picker hint — pasting and "All files" in the OS dialog both walk straight past it.
 */
function isAccepted(file: File, accept?: string): boolean {
  if (!accept) return true;
  return accept
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .some((pattern) =>
      pattern.endsWith("/*") ? file.type.startsWith(pattern.slice(0, -1)) : file.type === pattern
    );
}

export interface AttachmentUploadController {
  addFiles: (files: Iterable<File>) => Promise<void>;
  busy: boolean;
  error: string | null;
}

/**
 * Upload files to media-service (public) and append the `{fileId, fileName, url}` descriptors the
 * support API stores on a message. Split out from `AttachmentUploader` so a host — the chat
 * composer — can drive the same uploads from its own paste handler.
 */
export function useAttachmentUpload({
  value,
  onChange,
  accept,
}: {
  value: AttachmentDto[];
  onChange: (next: AttachmentDto[]) => void;
  accept?: string;
}): AttachmentUploadController {
  const upload = useUploadFile();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);

  const addFiles = async (files: Iterable<File>) => {
    setError(null);
    // Uploads are awaited in sequence, so `value` from this render goes stale after the first
    // onChange. Accumulate locally instead, or a multi-file pick keeps only the last file.
    let next = value;
    for (const file of Array.from(files)) {
      if (!isAccepted(file, accept)) {
        setError(`${file.name} isn't an image or video.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name} exceeds the 50 MB limit.`);
        continue;
      }
      setBusy((n) => n + 1);
      try {
        const result = await upload.mutateAsync({ file, visibility: "PUBLIC" });
        // The upload response usually carries a URL; fall back to resolving it by id.
        const url = result.url ?? (await fetchFileUrl(result.id).catch(() => null));
        next = [
          ...next,
          { fileId: result.id, fileName: result.file_name ?? file.name, url: url ?? undefined },
        ];
        onChange(next);
      } catch {
        setError(`Could not upload ${file.name}.`);
      } finally {
        setBusy((n) => n - 1);
      }
    }
  };

  return { addFiles, busy: busy > 0, error };
}
