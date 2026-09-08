import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Download,
  ImagePlus,
  Layers,
  Loader2,
  Package,
  Save,
  Smartphone,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DeviceFrame } from "@/components/apps/DeviceFrame";
import { CropCanvas, CropControls } from "@/components/apps/ImageCropper";
import { PLATFORM_ICONS } from "@/components/apps/StatusBadge";
import {
  assetFileName,
  autoFixTransform,
  buildZip,
  defaultTransform,
  downloadBlob,
  encodeWithinBudget,
  formatBytes,
  loadEditableImage,
  loadImage,
  ratioOf,
  readFileAsDataUrl,
  renderToCanvas,
  validateSource,
  type CropTransform,
  type LoadedImage,
} from "@/lib/image-processing";
import {
  DEVICE_LABELS,
  deviceForSpec,
  frameWidthForHeight,
  type DeviceKind,
} from "@/lib/device-frames";
import { assetSpecById, assetSpecsFor, type AssetSpec } from "@/lib/platform-requirements";
import { newId } from "@/services/app-registry-api";
import { uploadImage } from "@/services/app-registry-store";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  STORE_LABELS,
  activePlatforms,
  type AppRecord,
  type GeneratedAsset,
  type Platform,
  type SourceImage,
} from "@/types/app-registry";

/**
 * A guard against someone dropping a photo library in, not a store rule — every decoded source
 * stays in memory. Store listings never need anywhere near this many.
 */
const MAX_SOURCES = 60;

interface AssetStudioProps {
  app: AppRecord;
  onChange: (next: AppRecord) => void;
  notify: (tone: "success" | "error" | "info", text: string) => void;
  /** Restrict the studio to one platform (used inside an app's own Assets tab). */
  lockPlatform?: Platform;
}

interface PendingResult {
  spec: AssetSpec;
  sourceId: string;
  blob: Blob;
  format: string;
  bytes: number;
  note?: string;
  previewUrl: string;
}

/**
 * Images & App Assets (§7) plus the professional cropper (§8) and validation (§9).
 *
 * Source images go in; every store size comes out. Cropping is local canvas work —
 * instant, no round-trip — and only the finished asset is uploaded to media-service, so the whole
 * team sees the same artwork instead of a file on somebody's laptop.
 */
export function AssetStudio({ app, onChange, notify, lockPlatform }: AssetStudioProps) {
  const available = useMemo(() => {
    const active = activePlatforms(app);
    return active.length > 0 ? active : [...PLATFORMS];
  }, [app]);

  const [platform, setPlatform] = useState<Platform>(lockPlatform ?? available[0]);
  const specs = useMemo(() => assetSpecsFor(platform), [platform]);
  // The chosen target is derived rather than synced: switching platform simply falls back to that
  // platform's first slot, with no effect racing the render.
  const [preferredSpecId, setPreferredSpecId] = useState<string>("");
  const spec = useMemo(
    () => specs.find((s) => s.id === preferredSpecId) ?? specs[0],
    [specs, preferredSpecId]
  );
  const specId = spec?.id ?? "";

  const [preferredSourceId, setPreferredSourceId] = useState<string>("");
  const selectedSourceId =
    app.sourceImages.find((s) => s.id === preferredSourceId)?.id ?? app.sourceImages[0]?.id ?? "";
  const [images, setImages] = useState<Record<string, LoadedImage | "error">>({});
  const [transforms, setTransforms] = useState<Record<string, CropTransform>>({});
  const [pending, setPending] = useState<PendingResult | null>(null);
  const [busy, setBusy] = useState<null | "upload" | "generate" | "bulk" | "sources" | "zip">(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [preview, setPreview] = useState<GeneratedAsset | null>(null);
  /** Mock-ups are decoration only — they are never painted into the generated file. */
  const [framed, setFramed] = useState(true);

  /** Blobs produced this session, so bulk download never has to re-fetch from media-service. */
  const blobCache = useRef<Map<string, Blob>>(new Map());
  /** Object URLs for assets media-service never accepted — refs can't be read during render. */
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Only the selected source is pulled into an editable (untainted) image. With a dozen or more
  // sources loaded, decoding every one up front would cost a dozen round-trips and hold every
  // bitmap in memory for nothing — the thumbnails render straight from their URLs.
  useEffect(() => {
    const item = app.sourceImages.find((s) => s.id === selectedSourceId);
    if (!item || !item.url || images[item.id]) return;
    let cancelled = false;
    loadEditableImage(item.url)
      .then((loaded) => {
        if (!cancelled) setImages((m) => ({ ...m, [item.id]: loaded }));
      })
      .catch(() => {
        if (!cancelled) setImages((m) => ({ ...m, [item.id]: "error" }));
      });
    return () => {
      cancelled = true;
    };
  }, [app.sourceImages, images, selectedSourceId]);

  const activeImage = images[selectedSourceId];
  const loadedImage = activeImage && activeImage !== "error" ? activeImage : null;
  const source = app.sourceImages.find((s) => s.id === selectedSourceId);

  const transform = transforms[specId] ?? defaultTransform();
  const setTransform = useCallback(
    (next: CropTransform) => setTransforms((t) => ({ ...t, [specId]: next })),
    [specId]
  );

  const validation = useMemo(() => {
    if (!source || !spec) return null;
    return validateSource({ width: source.width, height: source.height, bytes: source.bytes }, spec);
  }, [source, spec]);

  /* ------------------------------------------------------------- sources */

  async function addSources(files: FileList | null) {
    if (!files || files.length === 0 || !spec) return;
    const room = MAX_SOURCES - app.sourceImages.length;
    if (room <= 0) {
      notify("error", `That's ${MAX_SOURCES} source images already — remove a few before adding more.`);
      return;
    }

    const queue = Array.from(files).slice(0, room);
    if (queue.length < files.length) {
      notify("info", `Taking the first ${queue.length} — that fills the ${MAX_SOURCES}-image limit.`);
    }

    setBusy("upload");
    setProgress({ done: 0, total: queue.length });
    const added: SourceImage[] = [];
    const loadedById: Record<string, LoadedImage> = {};

    for (const file of queue) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const loaded = await loadImage(dataUrl);
        const id = newId("src");

        let url = "";
        let fileId = "";
        try {
          const uploaded = await uploadImage(file, file.name);
          url = uploaded.url;
          fileId = uploaded.fileId;
        } catch {
          // Media-service being down shouldn't stop someone cropping right now — the image stays
          // usable for this session and the card says plainly that it isn't saved.
          notify("error", `${file.name} couldn't be saved to media-service. You can still crop it in this session.`);
        }

        added.push({
          id,
          name: file.name,
          url: url || dataUrl,
          fileId,
          width: loaded.width,
          height: loaded.height,
          bytes: file.size,
          createdAt: new Date().toISOString(),
        });
        loadedById[id] = loaded;
      } catch {
        notify("error", `Could not read ${file.name}.`);
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }

    if (added.length > 0) {
      setImages((m) => ({ ...m, ...loadedById }));
      onChange({ ...app, sourceImages: [...app.sourceImages, ...added] });
      setPreferredSourceId((current) => current || added[0].id);
      notify("success", `Added ${added.length} source image${added.length > 1 ? "s" : ""}.`);
    }
    setBusy(null);
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeSource(id: string) {
    onChange({
      ...app,
      sourceImages: app.sourceImages.filter((s) => s.id !== id),
      // Generated assets outlive their source on purpose — they're already uploaded artwork.
    });
    setImages((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
    if (selectedSourceId === id) setPreferredSourceId(app.sourceImages.find((s) => s.id !== id)?.id ?? "");
  }

  /* ------------------------------------------------------------ generate */

  async function generate() {
    if (!loadedImage || !spec) return;
    setBusy("generate");
    try {
      const canvas = renderToCanvas(loadedImage, spec, transform);
      const encoded = await encodeWithinBudget(canvas, spec);
      if (pending) URL.revokeObjectURL(pending.previewUrl);
      setPending({
        spec,
        sourceId: selectedSourceId,
        blob: encoded.blob,
        format: encoded.format,
        bytes: encoded.bytes,
        note: encoded.note,
        previewUrl: URL.createObjectURL(encoded.blob),
      });
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Could not generate the asset.");
    } finally {
      setBusy(null);
    }
  }

  async function saveAsset(result: PendingResult, silent = false, indexHint?: number): Promise<GeneratedAsset | null> {
    // A batch generates several files against the same slot before `app.assets` is updated, so the
    // caller passes the running index — otherwise every file in the batch is named "…-1".
    const index =
      indexHint ?? app.assets.filter((a) => a.platform === platform && a.specId === result.spec.id).length;
    const filename = assetFileName(app.basics.name || app.basics.displayName, result.spec, index, result.format);

    let url = "";
    let fileId = "";
    try {
      const uploaded = await uploadImage(result.blob, filename);
      url = uploaded.url;
      fileId = uploaded.fileId;
    } catch {
      if (!silent) {
        notify("error", "media-service rejected the upload. The asset is saved locally and still downloadable.");
      }
    }

    const asset: GeneratedAsset = {
      id: newId("asset"),
      platform: result.spec.platform,
      specId: result.spec.id,
      sourceImageId: result.sourceId,
      url,
      fileId,
      width: result.spec.width,
      height: result.spec.height,
      bytes: result.bytes,
      format: result.format,
      createdAt: new Date().toISOString(),
    };
    blobCache.current.set(asset.id, result.blob);
    if (!url) setLocalPreviews((map) => ({ ...map, [asset.id]: URL.createObjectURL(result.blob) }));
    return asset;
  }

  async function savePending() {
    if (!pending) return;
    setBusy("generate");
    const asset = await saveAsset(pending);
    if (asset) {
      onChange({ ...app, assets: [...app.assets, asset] });
      notify("success", `${pending.spec.label} saved${asset.fileId ? "" : " (local only)"}.`);
      URL.revokeObjectURL(pending.previewUrl);
      setPending(null);
    }
    setBusy(null);
  }

  /** "Generate All Required Sizes" — every required slot for this platform, auto-fitted. */
  async function generateAll() {
    if (!loadedImage) return;
    setBusy("bulk");
    const required = specs.filter((s) => s.required);
    setProgress({ done: 0, total: required.length });
    const created: GeneratedAsset[] = [];
    let failures = 0;

    for (const target of required) {
      try {
        const t = autoFixTransform(target, transforms[target.id] ?? defaultTransform());
        const canvas = renderToCanvas(loadedImage, target, t);
        const encoded = await encodeWithinBudget(canvas, target);
        const asset = await saveAsset(
          {
            spec: target,
            sourceId: selectedSourceId,
            blob: encoded.blob,
            format: encoded.format,
            bytes: encoded.bytes,
            previewUrl: "",
          },
          true
        );
        if (asset) created.push(asset);
      } catch {
        failures++;
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }

    if (created.length > 0) onChange({ ...app, assets: [...app.assets, ...created] });
    setBusy(null);
    setProgress(null);
    const unsaved = created.filter((a) => !a.fileId).length;
    notify(
      failures === 0 ? "success" : "error",
      `Generated ${created.length} of ${required.length} required ${PLATFORM_LABELS[platform]} assets` +
        (failures ? ` — ${failures} failed.` : ".") +
        (unsaved ? ` ${unsaved} couldn't be saved to media-service — downloadable here, but not shared.` : "")
    );
  }

  /** The editable form of a source, decoded on demand — only the selected one is preloaded. */
  async function editableFor(item: SourceImage, cache: Map<string, LoadedImage>): Promise<LoadedImage | null> {
    const known = images[item.id];
    if (known && known !== "error") return known;
    const cached = cache.get(item.id);
    if (cached) return cached;
    if (!item.url) return null;
    try {
      const loaded = await loadEditableImage(item.url);
      cache.set(item.id, loaded);
      return loaded;
    } catch {
      return null;
    }
  }

  /**
   * Every source cropped into the *current* slot in one pass.
   *
   * Store listings want several screenshots at the same size — Play refuses to publish with fewer
   * than two — so the real job is "turn these eight captures into eight phone screenshots", not
   * "crop one image eight times". Stops at the store's own per-slot maximum.
   */
  async function generateFromAllSources() {
    if (!spec || app.sourceImages.length === 0) return;
    const have = app.assets.filter((a) => a.platform === platform && a.specId === spec.id).length;
    const room = Math.max(0, spec.maxCount - have);
    if (room === 0) {
      notify("error", `${spec.label} already holds the ${spec.maxCount} the store accepts. Remove one first.`);
      return;
    }

    const queue = app.sourceImages.slice(0, room);
    setBusy("sources");
    setProgress({ done: 0, total: queue.length });
    const cache = new Map<string, LoadedImage>();
    const created: GeneratedAsset[] = [];
    let failures = 0;

    for (const item of queue) {
      try {
        const image = await editableFor(item, cache);
        if (!image) {
          failures++;
        } else {
          const t = autoFixTransform(spec, transforms[spec.id] ?? defaultTransform());
          const canvas = renderToCanvas(image, spec, t);
          const encoded = await encodeWithinBudget(canvas, spec);
          const asset = await saveAsset(
            {
              spec,
              sourceId: item.id,
              blob: encoded.blob,
              format: encoded.format,
              bytes: encoded.bytes,
              previewUrl: "",
            },
            true,
            have + created.length
          );
          if (asset) created.push(asset);
          else failures++;
        }
      } catch {
        failures++;
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }

    if (created.length > 0) onChange({ ...app, assets: [...app.assets, ...created] });
    if (cache.size > 0) setImages((m) => ({ ...m, ...Object.fromEntries(cache) }));
    setBusy(null);
    setProgress(null);

    const skipped = app.sourceImages.length - queue.length;
    const unsaved = created.filter((a) => !a.fileId).length;
    notify(
      failures === 0 ? "success" : "error",
      `Generated ${created.length} × ${spec.label} from your sources` +
        (failures ? ` — ${failures} failed.` : skipped ? ` — ${skipped} skipped, the store allows ${spec.maxCount}.` : ".") +
        // A silent batch upload must still own up to a media-service outage, or the assets look
        // saved and quietly vanish for everyone but this browser.
        (unsaved ? ` ${unsaved} couldn't be saved to media-service — downloadable here, but not shared.` : "")
    );
  }

  function autoFix() {
    if (!spec) return;
    setTransform(autoFixTransform(spec, transform));
    notify("info", "Reframed to fit the required size. Check the preview, then generate.");
  }

  /* ------------------------------------------------------------ downloads */

  async function blobFor(asset: GeneratedAsset): Promise<Blob | null> {
    const cached = blobCache.current.get(asset.id);
    if (cached) return cached;
    if (!asset.url) return null;
    try {
      const response = await fetch(asset.url, { mode: "cors" });
      if (!response.ok) return null;
      const blob = await response.blob();
      blobCache.current.set(asset.id, blob);
      return blob;
    } catch {
      return null;
    }
  }

  async function downloadOne(asset: GeneratedAsset) {
    const blob = await blobFor(asset);
    if (!blob) {
      // Cross-origin fetch blocked and nothing cached — opening the URL still gets them the file.
      if (asset.url) window.open(asset.url, "_blank", "noopener");
      else notify("error", "That asset isn't available in this session. Regenerate it to download.");
      return;
    }
    const target = assetSpecById(asset.specId);
    const name = target
      ? assetFileName(app.basics.name || "app", target, 0, asset.format)
      : `${asset.specId}.${asset.format === "jpeg" ? "jpg" : asset.format}`;
    downloadBlob(blob, name);
  }

  async function downloadZip() {
    const assets = app.assets.filter((a) => a.platform === platform);
    if (assets.length === 0) return;
    setBusy("zip");
    const files: Array<{ name: string; blob: Blob }> = [];
    let missing = 0;
    const counters: Record<string, number> = {};

    for (const asset of assets) {
      const blob = await blobFor(asset);
      if (!blob) {
        missing++;
        continue;
      }
      const target = specs.find((s) => s.id === asset.specId);
      const index = counters[asset.specId] ?? 0;
      counters[asset.specId] = index + 1;
      files.push({
        name: target ? assetFileName(app.basics.name || "app", target, index, asset.format) : `${asset.specId}-${index + 1}.${asset.format}`,
        blob,
      });
    }

    if (files.length > 0) {
      const slug = (app.basics.name || "app").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      downloadBlob(await buildZip(files), `${slug}-${platform.toLowerCase()}-store-assets.zip`);
    }
    setBusy(null);
    notify(
      missing === 0 ? "success" : "info",
      missing === 0
        ? `Downloaded ${files.length} assets as a zip.`
        : `Downloaded ${files.length} assets. ${missing} couldn't be fetched — regenerate them to include them.`
    );
  }

  function deleteAsset(id: string) {
    onChange({ ...app, assets: app.assets.filter((a) => a.id !== id) });
    blobCache.current.delete(id);
    setLocalPreviews((map) => {
      if (map[id]) URL.revokeObjectURL(map[id]);
      const next = { ...map };
      delete next[id];
      return next;
    });
  }

  /* ---------------------------------------------------------------- render */

  const platformAssets = app.assets.filter((a) => a.platform === platform);
  const slotHave = spec ? platformAssets.filter((a) => a.specId === spec.id).length : 0;
  /** How many more the store will accept in this slot — Play stops at 8 screenshots, Apple at 10. */
  const slotRoom = spec ? Math.max(0, spec.maxCount - slotHave) : 0;
  const frameOf = (target: AssetSpec): DeviceKind => (framed ? deviceForSpec(target) : "plain");
  const cropFrame = spec ? frameOf(spec) : "plain";
  const previewSpec = preview ? assetSpecById(preview.specId) : undefined;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        {/* ---------------------------------------------------- left: sources */}
        <Card className="xl:sticky xl:top-0 xl:self-start">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Source Images</CardTitle>
              {app.sourceImages.length > 0 && <Badge variant="secondary">{app.sourceImages.length}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {app.sourceImages.length > 0 && (
              // A grid rather than a list: a dozen sources is normal, and every one of them has to
              // stay one click away while you work through the slots.
              <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto pr-1">
                {app.sourceImages.map((item, index) => {
                  const state = images[item.id];
                  const selected = selectedSourceId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.name}
                      onClick={() => setPreferredSourceId(item.id)}
                      className={cn(
                        "group relative rounded-md border p-1 text-left transition-colors",
                        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"
                      )}
                    >
                      <img src={item.url} alt="" className="h-16 w-full rounded bg-muted/40 object-cover" />
                      <span className="mt-1 flex items-baseline justify-between gap-1">
                        <span className="text-[10px] font-medium">{index + 1}</span>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {item.width}×{item.height}
                        </span>
                      </span>
                      <span className="absolute left-1.5 top-1.5 flex gap-1">
                        {state === "error" && (
                          <span title="Re-upload this one to edit it" className="rounded bg-background/90 p-0.5 text-amber-600">
                            <AlertTriangle className="h-3 w-3" />
                          </span>
                        )}
                        {!item.fileId && (
                          <span title="Not saved to media-service" className="rounded bg-background/90 p-0.5 text-amber-600">
                            <CloudOff className="h-3 w-3" />
                          </span>
                        )}
                      </span>
                      <span
                        role="button"
                        tabIndex={-1}
                        title="Remove"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeSource(item.id);
                        }}
                        className="absolute right-1 top-1 rounded bg-background/90 p-0.5 opacity-0 shadow-sm transition-opacity hover:text-destructive group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => addSources(event.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={busy === "upload"}
              onClick={() => fileInputRef.current?.click()}
            >
              {busy === "upload" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-1 h-4 w-4" />
              )}
              {app.sourceImages.length > 0 ? "Add more images" : "Upload images"}
            </Button>
            {busy === "upload" && progress && (
              <p className="text-center text-[11px] text-muted-foreground">
                Uploading {progress.done} of {progress.total}…
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Upload as many screenshots as you need — pick as many files as you like at once. Every store size is
              generated from these, so use the largest, cleanest captures you have. Click one to crop it.
            </p>
          </CardContent>
        </Card>

        {/* --------------------------------------------------- centre: canvas */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm">
                {spec ? spec.label : "Crop"}
                {spec && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {spec.width} × {spec.height}
                  </span>
                )}
              </CardTitle>
              <Button
                size="sm"
                variant={framed ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => setFramed((on) => !on)}
                title="Preview the asset inside the device it ships to. Decoration only — the generated file is unaffected."
              >
                <Smartphone className="mr-1 h-3.5 w-3.5" />
                {framed ? DEVICE_LABELS[cropFrame] : "Device frame"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {spec && (
              <CropCanvas
                image={loadedImage}
                spec={spec}
                transform={transform}
                onTransform={setTransform}
                frame={cropFrame}
              />
            )}
            {spec && <CropControls spec={spec} transform={transform} onTransform={setTransform} disabled={!loadedImage} />}
          </CardContent>
        </Card>

        {/* ---------------------------------------------------- right: target */}
        <Card className="xl:sticky xl:top-0 xl:self-start">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Target</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!lockPlatform && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Platform</label>
                <Select value={platform} onValueChange={(value) => setPlatform(value as Platform)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((option) => (
                      <SelectItem key={option} value={option}>
                        {STORE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Asset type</label>
              <Select value={specId} onValueChange={setPreferredSpecId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {specs.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                      {option.required ? " *" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {spec && (
              <dl className="space-y-1.5 rounded-md border bg-muted/30 p-3 text-xs">
                <Row label="Required">
                  {spec.width} × {spec.height} px {spec.mode === "MIN" && <span className="text-muted-foreground">(min)</span>}
                </Row>
                <Row label="Aspect ratio">{ratioOf(spec.width, spec.height)}</Row>
                <Row label="Source">{source ? `${source.width} × ${source.height}` : "—"}</Row>
                <Row label="Source ratio">{source ? ratioOf(source.width, source.height) : "—"}</Row>
                <Row label="Formats">{spec.formats.map((f) => f.toUpperCase()).join(" / ")}</Row>
                <Row label="Max size">{formatBytes(spec.maxBytes)}</Row>
                <Row label="Transparency">
                  {spec.transparency === "FORBIDDEN" ? "Not allowed" : spec.transparency === "REQUIRED" ? "Required" : "Optional"}
                </Row>
                <Row label="Have">
                  {app.assets.filter((a) => a.platform === platform && a.specId === spec.id).length}
                  {spec.minCount > 0 && <span className="text-muted-foreground"> / {spec.minCount} needed</span>}
                </Row>
              </dl>
            )}

            {spec && <p className="text-[11px] leading-relaxed text-muted-foreground">{spec.helpText}</p>}

            {validation && (
              <div
                className={cn(
                  "space-y-1.5 rounded-md border p-3 text-xs",
                  validation.needsAttention
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-green-500/40 bg-green-500/5"
                )}
              >
                <p className="flex items-center gap-1.5 font-medium">
                  {validation.needsAttention ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-amber-600" /> Needs attention
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-600" /> Ready for upload
                    </>
                  )}
                </p>
                {validation.issues.map((issue, index) => (
                  <p
                    key={index}
                    className={cn(
                      "leading-relaxed",
                      issue.level === "info" ? "text-muted-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {issue.message}
                  </p>
                ))}
                {validation.needsAttention && validation.issues.some((i) => i.autoFixable) && (
                  <Button size="sm" variant="outline" className="mt-1 h-7 w-full text-xs" onClick={autoFix}>
                    <Wand2 className="mr-1 h-3.5 w-3.5" />
                    Auto Fix
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Button className="w-full" disabled={!loadedImage || busy != null} onClick={generate}>
                {busy === "generate" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                Generate Asset
              </Button>
              {/* Only slots the store lets you fill more than once — one icon from nine sources is
                  nonsense — and only while there is room left in the slot. */}
              {app.sourceImages.length > 1 && spec && spec.maxCount > 1 && slotRoom > 0 && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy != null}
                  onClick={generateFromAllSources}
                  title={`Crop every source image into a ${spec.label} in one pass`}
                >
                  {busy === "sources" ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Layers className="mr-1 h-4 w-4" />
                  )}
                  {slotHave > 0
                    ? `Generate ${Math.min(app.sourceImages.length, slotRoom)} more from your sources`
                    : slotRoom < app.sourceImages.length
                      ? `Generate ${slotRoom} from your sources`
                      : `Generate from all ${app.sourceImages.length} sources`}
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full"
                disabled={!loadedImage || busy != null}
                onClick={generateAll}
              >
                {busy === "bulk" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Package className="mr-1 h-4 w-4" />}
                Generate All Required Sizes
              </Button>
              {(busy === "sources" || busy === "bulk") && progress && (
                <p className="text-center text-[11px] text-muted-foreground">
                  Rendering {progress.done} of {progress.total}…
                </p>
              )}
            </div>

            {pending && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs font-medium">{pending.spec.label} — preview</p>
                <div
                  className="mx-auto"
                  style={{ maxWidth: `${Math.round(frameWidthForHeight(frameOf(pending.spec), pending.spec, 240))}px` }}
                >
                  <DeviceFrame kind={frameOf(pending.spec)}>
                    <img src={pending.previewUrl} alt="" className="block w-full" />
                  </DeviceFrame>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {pending.spec.width} × {pending.spec.height} · {pending.format.toUpperCase()} ·{" "}
                  {formatBytes(pending.bytes)}
                  {pending.bytes > pending.spec.maxBytes && (
                    <span className="ml-1 font-medium text-destructive">over the {formatBytes(pending.spec.maxBytes)} limit</span>
                  )}
                </p>
                {pending.note && <p className="text-[11px] text-amber-600">{pending.note}</p>}
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" disabled={busy != null} onClick={savePending}>
                    <Save className="mr-1 h-3.5 w-3.5" />
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() =>
                      downloadBlob(
                        pending.blob,
                        assetFileName(app.basics.name || "app", pending.spec, 0, pending.format)
                      )
                    }
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    Download
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------ gallery */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">
              Generated assets — {STORE_LABELS[platform]}
              <Badge variant="secondary" className="ml-2">
                {platformAssets.length}
              </Badge>
            </CardTitle>
            <Button size="sm" variant="outline" disabled={platformAssets.length === 0 || busy != null} onClick={downloadZip}>
              {busy === "zip" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
              Download all as .zip
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {platformAssets.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing generated for {PLATFORM_LABELS[platform]} yet. Pick a target on the right and hit Generate.
            </p>
          ) : (
            <div className="space-y-5">
              {specs
                .filter((s) => platformAssets.some((a) => a.specId === s.id))
                .map((target) => {
                  const rows = platformAssets.filter((a) => a.specId === target.id);
                  const short = target.minCount > rows.length;
                  return (
                    <div key={target.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold">{target.label}</p>
                        <Badge variant={short ? "warning" : "success"} className="text-[10px]">
                          {rows.length}
                          {target.minCount > 0 ? ` / ${target.minCount}` : ""}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        {rows.map((asset) => (
                          <div
                            key={asset.id}
                            className={cn(
                              "group relative",
                              target.group === "icon" ? "w-24" : target.height > target.width ? "w-28" : "w-44"
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => setPreview(asset)}
                              className={cn(
                                "block w-full",
                                !framed && "overflow-hidden rounded-md border bg-muted/30"
                              )}
                            >
                              <DeviceFrame kind={frameOf(target)}>
                                <img src={asset.url || localPreviews[asset.id] || ""} alt="" className="block w-full" />
                              </DeviceFrame>
                            </button>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              {asset.width}×{asset.height} · {formatBytes(asset.bytes)}
                            </p>
                            {!asset.fileId && (
                              <p className="flex items-center gap-1 text-[10px] text-amber-600">
                                <CloudOff className="h-3 w-3" /> local only
                              </p>
                            )}
                            <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => downloadOne(asset)}
                                className="rounded bg-background/90 p-1 shadow hover:bg-accent"
                                title="Download"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteAsset(asset.id)}
                                className="rounded bg-background/90 p-1 shadow hover:bg-destructive/10 hover:text-destructive"
                                title="Remove"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={preview != null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {previewSpec?.label ?? "Asset"}
              {preview && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {preview.width} × {preview.height} · {formatBytes(preview.bytes)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div
              className="mx-auto"
              style={{
                maxWidth: previewSpec
                  ? `${Math.round(frameWidthForHeight(frameOf(previewSpec), previewSpec, Math.round(window.innerHeight * 0.68)))}px`
                  : undefined,
              }}
            >
              <DeviceFrame kind={previewSpec ? frameOf(previewSpec) : "plain"}>
                <img src={preview.url || localPreviews[preview.id] || ""} alt="" className="block w-full" />
              </DeviceFrame>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

/** Platform picker chips reused by the studio's host pages. */
export function PlatformTabs({
  platforms,
  value,
  onChange,
}: {
  platforms: Platform[];
  value: Platform;
  onChange: (platform: Platform) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {platforms.map((platform) => {
        const Icon = PLATFORM_ICONS[platform];
        return (
          <button
            key={platform}
            type="button"
            onClick={() => onChange(platform)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              value === platform ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            <Icon className="h-4 w-4" />
            {PLATFORM_LABELS[platform]}
          </button>
        );
      })}
    </div>
  );
}
