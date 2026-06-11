import { createElement } from "react";
import {
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  FileCode,
  File as FileIcon,
} from "lucide-react";

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fileTypeIcon(fileType: string | null | undefined): typeof FileIcon {
  const type = (fileType || "").toLowerCase();
  if (type.startsWith("image/")) return FileImage;
  if (type.startsWith("video/")) return FileVideo;
  if (type.startsWith("audio/")) return FileAudio;
  if (type === "application/pdf" || type.startsWith("text/")) return FileText;
  if (type.includes("zip") || type.includes("tar") || type.includes("compressed")) return FileArchive;
  if (type.includes("spreadsheet") || type.includes("excel") || type.includes("csv")) return FileSpreadsheet;
  if (type.includes("json") || type.includes("xml") || type.includes("javascript")) return FileCode;
  return FileIcon;
}

export function FileTypeIcon({
  fileType,
  className,
}: {
  fileType: string | null | undefined;
  className?: string;
}) {
  return createElement(fileTypeIcon(fileType), { className });
}

export function isImage(fileType: string | null | undefined): boolean {
  return (fileType || "").toLowerCase().startsWith("image/");
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

export const FILE_TYPE_FILTERS: Array<{ label: string; value: string }> = [
  { label: "Images", value: "image/" },
  { label: "Videos", value: "video/" },
  { label: "Audio", value: "audio/" },
  { label: "PDFs", value: "application/pdf" },
  { label: "Text", value: "text/" },
];
