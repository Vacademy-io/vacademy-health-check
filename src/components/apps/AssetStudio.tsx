import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Download,
  ImagePlus,
  Loader2,
  Package,
  Save,
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

const MAX_SOURCES = 3;

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
 * Up to three source images go in; every store size comes out. Cropping is local canvas work —
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
  const [busy, setBusy] = useState<null | "upload" | "generate" | "bulk" | "zip">(null);
  const [preview, setPreview] = useState<GeneratedAsset | null>(null);

  /** Blobs produced this session, so bulk download never has to re-fetch from media-service. */
  const blobCache = useRef<Map<string, Blob>>(new Map());
  /** Object URLs for assets media-service never accepted — refs can't be read during render. */
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pull each source into an editable (untainted) image the canvas can export from.
  useEffect(() => {
    let cancelled = false;
    for (const item of app.sourceImages) {
      if (images[item.id] || !item.url) continue;
      loadEditableImage(item.url)
        .then((loaded) => {
          if (!cancelled) setImages((m) => ({ ...m, [item.id]: loaded }));
        })
        .catch(() => {
          if (!cancelled) setImages((m) => ({ ...m, [item.id]: "error" }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [app.sourceImages, images]);

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
      notify("error", `You already have ${MAX_SOURCES} source images. Remove one first.`);
      return;
    }

    setBusy("upload");
    const added: SourceImage[] = [];
    const loadedById: Record<string, LoadedImage> = {};

    for (const file of Array.from(files).slice(0, room)) {
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
    }

    if (added.length > 0) {
      setImages((m) => ({ ...m, ...loadedById }));
      onChange({ ...app, sourceImages: [...app.sourceImages, ...added] });
      setPreferredSourceId((current) => current || added[0].id);
      notify("success", `Added ${added.length} source image${added.length > 1 ? "s" : ""}.`);
    }
    setBusy(null);
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

  async function saveAsset(result: PendingResult, silent = false): Promise<GeneratedAsset | null> {
    const index = app.assets.filter((a) => a.platform === platform && a.specId === result.spec.id).length;
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
    }

    if (created.length > 0) onChange({ ...app, assets: [...app.assets, ...created] });
    setBusy(null);
    notify(
      failures === 0 ? "success" : "error",
      `Generated ${created.length} of ${required.length} required ${PLATFORM_LABELS[platform]} assets` +
        (failures ? ` — ${failures} failed.` : ".")
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

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        {/* ---------------------------------------------------- left: sources */}
        <Card className="xl:sticky xl:top-0 xl:self-start">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Source Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {app.sourceImages.map((item, index) => {
              const state = images[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPreferredSourceId(item.id)}
                  className={cn(
                    "group relative flex w-full items-center gap-2 rounded-md border p-2 text-left transition-colors",
                    selectedSourceId === item.id ? "border-primary bg-primary/5" : "hover:bg-accent"
                  )}
                >
                  <img src={item.url} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">Image {index + 1}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {item.width} × {item.height}
                    </span>
                    {state === "error" && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600">
                        <AlertTriangle className="h-3 w-3" /> re-upload to edit
                      </span>
                    )}
                    {!item.fileId && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600">
                        <CloudOff className="h-3 w-3" /> not saved
                      </span>
                    )}
                  </span>
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeSource(item.id);
                    }}
                    className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}

            {app.sourceImages.length < MAX_SOURCES && (
              <>
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
                  Upload image
                </Button>
              </>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Up to {MAX_SOURCES} sources. Every store size is generated from these, so upload the largest, cleanest
              screenshots you have.
            </p>
          </CardContent>
        </Card>

        {/* --------------------------------------------------- centre: canvas */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {spec ? spec.label : "Crop"}
              {spec && (
                <span className="ml-2 font-normal text-muted-foreground">
                  {spec.width} × {spec.height}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {spec && <CropCanvas image={loadedImage} spec={spec} transform={transform} onTransform={setTransform} />}
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
              <Button
                variant="outline"
                className="w-full"
                disabled={!loadedImage || busy != null}
                onClick={generateAll}
              >
                {busy === "bulk" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Package className="mr-1 h-4 w-4" />}
                Generate All Required Sizes
              </Button>
            </div>

            {pending && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs font-medium">{pending.spec.label} — preview</p>
                <img src={pending.previewUrl} alt="" className="max-h-40 w-full rounded object-contain" />
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
                      <div className="flex flex-wrap gap-3">
                        {rows.map((asset) => (
                          <div key={asset.id} className="group relative w-32">
                            <button
                              type="button"
                              onClick={() => setPreview(asset)}
                              className="block w-full overflow-hidden rounded-md border bg-muted/30"
                            >
                              <img
                                src={asset.url || localPreviews[asset.id] || ""}
                                alt=""
                                className="h-24 w-full object-contain"
                              />
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
              {specs.find((s) => s.id === preview?.specId)?.label ?? "Asset"}
              {preview && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {preview.width} × {preview.height} · {formatBytes(preview.bytes)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <img
              src={preview.url || localPreviews[preview.id] || ""}
              alt=""
              className="max-h-[70vh] w-full rounded border object-contain"
            />
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
