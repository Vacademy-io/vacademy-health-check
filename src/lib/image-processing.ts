/**
 * Client-side image engine for the asset studio.
 *
 * Everything happens in a canvas in the browser — no upload round-trip to preview a crop, no
 * server-side image pipeline to run. The output is byte-identical to what the store receives,
 * because the canvas *is* rendered at the store's exact pixel size.
 */

import type { AssetSpec } from "@/lib/platform-requirements";

/* ------------------------------------------------------------------ loading */

export interface LoadedImage {
  el: HTMLImageElement;
  width: number;
  height: number;
}

export function loadImage(src: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    // Source images come back from media-service on another origin; without this the canvas is
    // tainted and toBlob() throws a SecurityError at export time.
    el.crossOrigin = "anonymous";
    el.onload = () => resolve({ el, width: el.naturalWidth, height: el.naturalHeight });
    el.onerror = () => reject(new Error("Could not load image"));
    el.src = src;
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------------- transform */

export interface CropTransform {
  /** Multiplier on top of the fit/fill baseline. 1 = exactly fitted. */
  zoom: number;
  /** Pan, expressed in output-canvas pixels so it survives display scaling. */
  offsetX: number;
  offsetY: number;
  /** Degrees, free-form (the Rotate button steps by 90). */
  rotation: number;
  /** CSS colour painted behind the image, or "transparent" for PNGs that allow alpha. */
  background: string;
  /** COVER crops to fill the frame; CONTAIN letterboxes the whole image inside it. */
  mode: "COVER" | "CONTAIN";
}

export function defaultTransform(): CropTransform {
  return { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, background: "#ffffff", mode: "COVER" };
}

/** Scale at which the image exactly fills (COVER) or exactly fits (CONTAIN) the target frame. */
export function baselineScale(
  imgW: number,
  imgH: number,
  targetW: number,
  targetH: number,
  rotation: number,
  mode: "COVER" | "CONTAIN"
): number {
  // A quarter-turn swaps which image axis faces which frame axis.
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const boundW = imgW * cos + imgH * sin;
  const boundH = imgW * sin + imgH * cos;
  const sx = targetW / boundW;
  const sy = targetH / boundH;
  return mode === "COVER" ? Math.max(sx, sy) : Math.min(sx, sy);
}

/**
 * Paints the transform in *output pixel space*. The preview and the exported file run the exact
 * same code — the preview just scales the context down first — so what you drag is what ships.
 */
export function paint(ctx: CanvasRenderingContext2D, image: LoadedImage, spec: AssetSpec, t: CropTransform) {
  const opaque = spec.transparency === "FORBIDDEN" || t.background !== "transparent";
  if (opaque) {
    ctx.fillStyle = t.background === "transparent" ? "#ffffff" : t.background;
    ctx.fillRect(0, 0, spec.width, spec.height);
  }

  const scale = baselineScale(image.width, image.height, spec.width, spec.height, t.rotation, t.mode) * t.zoom;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  ctx.translate(spec.width / 2 + t.offsetX, spec.height / 2 + t.offsetY);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.drawImage(image.el, -image.width / 2, -image.height / 2, image.width, image.height);
  ctx.restore();
}

/** Renders the transform into a canvas at the spec's exact output size. */
export function renderToCanvas(image: LoadedImage, spec: AssetSpec, t: CropTransform): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  paint(ctx, image, spec, t);
  return canvas;
}

/**
 * Draws the same composition into an on-screen canvas at `displayWidth` px.
 * Returns the display scale, which the drag handler needs to convert screen pixels back into
 * output pixels — otherwise panning would move at the wrong speed on every different-sized target.
 */
export function paintPreview(
  canvas: HTMLCanvasElement,
  image: LoadedImage,
  spec: AssetSpec,
  t: CropTransform,
  displayWidth: number
): number {
  const k = displayWidth / spec.width;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(displayWidth * dpr);
  canvas.height = Math.round(spec.height * k * dpr);
  canvas.style.width = `${Math.round(displayWidth)}px`;
  canvas.style.height = `${Math.round(spec.height * k)}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return k;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(k * dpr, k * dpr);
  paint(ctx, image, spec, t);
  return k;
}

/**
 * Loads an image in a form the canvas can actually export.
 *
 * Media-service URLs are cross-origin; drawing one straight from an `<img>` taints the canvas and
 * `toBlob()` then throws. Fetching the bytes and going through a same-origin blob URL sidesteps
 * that entirely — and when the fetch is CORS-blocked we find out here, before the user has spent
 * five minutes positioning a crop that could never be exported.
 */
export async function loadEditableImage(src: string): Promise<LoadedImage> {
  if (src.startsWith("data:") || src.startsWith("blob:")) return loadImage(src);
  const response = await fetch(src, { mode: "cors" });
  if (!response.ok) throw new Error(`Image fetch failed (HTTP ${response.status})`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await loadImage(objectUrl);
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/* ------------------------------------------------------------------ encoding */

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))),
      type,
      quality
    );
  });
}

export interface EncodedAsset {
  blob: Blob;
  format: "png" | "jpeg";
  bytes: number;
  /** Set when the encoder had to fall back or compress to stay under the store's size cap. */
  note?: string;
}

/**
 * Encodes within the spec's byte budget: PNG first when allowed, then JPEG at descending quality.
 * Store size caps are hard rejections, so silently blowing past one is worse than a small
 * quality loss the user is told about.
 */
export async function encodeWithinBudget(canvas: HTMLCanvasElement, spec: AssetSpec): Promise<EncodedAsset> {
  const wantsPng = spec.formats.includes("png");
  const allowsJpeg = spec.formats.includes("jpeg");

  if (wantsPng) {
    const png = await canvasToBlob(canvas, "image/png");
    if (png.size <= spec.maxBytes) return { blob: png, format: "png", bytes: png.size };
    if (!allowsJpeg) {
      return {
        blob: png,
        format: "png",
        bytes: png.size,
        note: `PNG is ${formatBytes(png.size)}, over the ${formatBytes(spec.maxBytes)} limit, and this slot only accepts PNG. Simplify the image.`,
      };
    }
  }

  if (allowsJpeg) {
    for (const quality of [0.92, 0.85, 0.78, 0.7, 0.6]) {
      const jpeg = await canvasToBlob(canvas, "image/jpeg", quality);
      if (jpeg.size <= spec.maxBytes) {
        return {
          blob: jpeg,
          format: "jpeg",
          bytes: jpeg.size,
          note: wantsPng ? `Saved as JPEG at ${Math.round(quality * 100)}% to stay under the size limit.` : undefined,
        };
      }
    }
    const last = await canvasToBlob(canvas, "image/jpeg", 0.5);
    return { blob: last, format: "jpeg", bytes: last.size, note: "Still over the size limit even at 50% quality." };
  }

  const png = await canvasToBlob(canvas, "image/png");
  return { blob: png, format: "png", bytes: png.size };
}

/* ---------------------------------------------------------------- validation */

/**
 * `info` is not a problem — it's the tool telling you what it's about to do on your behalf.
 * Cropping a 20:9 phone capture down to 16:9 is the whole point of the studio, so surfacing it as
 * a warning would train people to ignore the warnings that matter.
 */
export type IssueLevel = "error" | "warning" | "info";

export interface ValidationIssue {
  level: IssueLevel;
  message: string;
  /** True when "Auto Fix" can resolve it without asking anything further. */
  autoFixable: boolean;
}

export interface ValidationResult {
  /** No blocking errors. */
  ok: boolean;
  /** Something the user should actually look at — informational notes don't count. */
  needsAttention: boolean;
  issues: ValidationIssue[];
}

/**
 * Validates the *source* image against a spec, before anything is generated.
 *
 * The cropper always outputs the exact required pixel size, so the only real question is whether
 * there are enough source pixels to do that without visible upscaling — plus format/aspect
 * mismatches worth warning about.
 */
export function validateSource(
  source: { width: number; height: number; bytes: number; type?: string },
  spec: AssetSpec
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (source.width < spec.width || source.height < spec.height) {
    issues.push({
      level: source.width * 2 < spec.width || source.height * 2 < spec.height ? "error" : "warning",
      message: `Image is ${source.width} × ${source.height}. ${
        spec.mode === "EXACT" ? "Required" : "Required minimum"
      } is ${spec.width} × ${spec.height} — it will be upscaled and look soft.`,
      autoFixable: true,
    });
  }

  const sourceRatio = source.width / source.height;
  const targetRatio = spec.width / spec.height;
  const ratioDrift = Math.abs(sourceRatio - targetRatio) / targetRatio;
  if (ratioDrift > 0.15) {
    issues.push({
      // A screenshot is *meant* to be recomposed; a logo cropped through the middle is a mistake.
      level: spec.group === "screenshot" ? "info" : "warning",
      message:
        spec.group === "screenshot"
          ? `Source is ${ratioOf(source.width, source.height)}, the slot is ${ratioOf(spec.width, spec.height)} — drag to choose what stays in frame.`
          : `Aspect ratio ${ratio(sourceRatio)} doesn't match the required ${ratio(targetRatio)} — the crop will cut off part of the image.`,
      autoFixable: true,
    });
  }

  // Stores that publish a hard cap reject the raw file outright; cropping is what makes it legal.
  if (spec.maxAspectRatio) {
    const longToShort = Math.max(source.width, source.height) / Math.min(source.width, source.height);
    if (longToShort > spec.maxAspectRatio) {
      issues.push({
        level: "info",
        message: `Your ${longToShort.toFixed(2)}:1 source is past this store's ${spec.maxAspectRatio}:1 limit and would be refused as-is. Generating at ${spec.width} × ${spec.height} brings it inside the limit.`,
        autoFixable: true,
      });
    }
  }

  if (spec.transparency === "FORBIDDEN" && source.type === "image/png") {
    issues.push({
      level: "warning",
      message: "This slot rejects transparency. Any alpha will be flattened onto the background colour.",
      autoFixable: true,
    });
  }

  if (source.bytes > spec.maxBytes * 4) {
    issues.push({
      level: "warning",
      message: `Source is ${formatBytes(source.bytes)}. The output is capped at ${formatBytes(spec.maxBytes)} and will be recompressed.`,
      autoFixable: true,
    });
  }

  return {
    ok: !issues.some((i) => i.level === "error"),
    needsAttention: issues.some((i) => i.level === "error" || i.level === "warning"),
    issues,
  };
}

/**
 * The "Auto Fix" behaviour: pick the transform that satisfies the spec with the least damage.
 * Cover-fill at baseline zoom, centred, flattened onto white when alpha is banned.
 */
export function autoFixTransform(spec: AssetSpec, current: CropTransform): CropTransform {
  return {
    ...current,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    // Icons and graphics read better letterboxed than cropped through the middle of a logo.
    mode: spec.group === "screenshot" ? "COVER" : "CONTAIN",
    background: spec.transparency === "FORBIDDEN" && current.background === "transparent" ? "#ffffff" : current.background,
  };
}

/* -------------------------------------------------------------------- format */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function ratio(value: number): string {
  // Snap to a tidy w:h using the actual pixel pair when we have it.
  const w = Math.round(value * 1000);
  const h = 1000;
  const g = gcd(w, h);
  const rw = w / g;
  const rh = h / g;
  if (rw > 40 || rh > 40) return value.toFixed(2).replace(/\.00$/, "") + ":1";
  return `${rw}:${rh}`;
}

/**
 * Human-readable aspect ratio. A tidy reduction (9:16, 4:3) is what people recognise, but real
 * capture sizes reduce to nonsense like 195:422 — fall back to a decimal against 1 for those.
 */
export function ratioOf(w: number, h: number): string {
  const g = gcd(w, h);
  const rw = w / g;
  const rh = h / g;
  if (rw <= 40 && rh <= 40) return `${rw}:${rh}`;
  return w >= h ? `${(w / h).toFixed(2)}:1` : `1:${(h / w).toFixed(2)}`;
}

/* ---------------------------------------------------------------- downloads */

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — Safari cancels the download if the URL dies too early.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function assetFileName(appName: string, spec: AssetSpec, index: number, format: string): string {
  const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
  const ext = format === "jpeg" ? "jpg" : format;
  return `${slug}_${spec.id}_${String(index + 1).padStart(2, "0")}.${ext}`;
}

/* ---------------------------------------------------------------- zip writer */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Minimal store-only (uncompressed) ZIP writer.
 *
 * A bulk asset export is a pile of PNGs and JPEGs, which are already compressed — deflating them
 * again buys nothing, so storing them straight avoids pulling a zip dependency into the dashboard.
 */
export async function buildZip(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate =
    ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    chunks.push(local, data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, eocd], { type: "application/zip" });
}
