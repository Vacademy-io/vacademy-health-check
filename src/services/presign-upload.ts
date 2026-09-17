import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import api from "@/lib/axios";

interface SignedUrlResponse {
  id: string;
  url: string;
}

interface UploadVideoToS3Vars {
  file: File;
  onProgress?: (percent: number) => void;
}

interface UploadVideoToS3Result {
  id: string;
  url: string;
}

/**
 * Uploads a (potentially large) video straight to S3 via a presigned PUT.
 *
 * The multipart `/files/upload` endpoint buffers the whole body through Cloudflare (413) and
 * Spring's `multipart` limits (20 MB on stage) — both reject real MP4s. This mirrors the admin
 * dashboard's {@code UploadFileInS3} + the media-service public presign flow: ask for a signed
 * PUT URL, stream the bytes directly to S3 with bare axios (no Authorization header, or the S3
 * signature breaks), then resolve the permanent public/CDN URL for playback.
 */
export function useUploadVideoToS3() {
  return useMutation({
    mutationFn: async ({ file, onProgress }: UploadVideoToS3Vars): Promise<UploadVideoToS3Result> => {
      const fileName = file.name.toLowerCase().replace(/\s+/g, "_");
      const fileType = file.type || "application/octet-stream";

      // 1) Ask media-service for a presigned PUT URL (public route).
      const { data: signed } = await api.post<SignedUrlResponse>(
        "/media-service/public/get-signed-url",
        { fileName, fileType, source: "training-videos", sourceId: "training-videos" }
      );

      // 2) Stream the bytes directly to S3 — bypasses Cloudflare + Spring body limits.
      await axios.put(signed.url, file, {
        headers: { "Content-Type": fileType },
        timeout: 0,
        onUploadProgress: (e) => {
          if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      });

      // 3) Resolve the permanent public/CDN URL the admin popup streams from.
      const { data: url } = await api.get<string>("/media-service/public/get-public-url", {
        params: { fileId: signed.id },
      });

      return { id: signed.id, url };
    },
  });
}