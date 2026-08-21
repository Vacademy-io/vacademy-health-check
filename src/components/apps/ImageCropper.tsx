import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, RotateCw, RotateCcw, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { paintPreview, type CropTransform, type LoadedImage } from "@/lib/image-processing";
import type { AssetSpec } from "@/lib/platform-requirements";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;

interface CropCanvasProps {
  image: LoadedImage | null;
  spec: AssetSpec;
  transform: CropTransform;
  onTransform: (next: CropTransform) => void;
  className?: string;
}

/**
 * The crop canvas (§8). Drag to pan, wheel to zoom, and what you see is exactly the file that
 * gets generated — the preview runs the same painter as the exporter, only scaled down.
 */
export function CropCanvas({ image, spec, transform, onTransform, className }: CropCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [displayWidth, setDisplayWidth] = useState(0);

  // Track the available width so the canvas fills the panel without ever overflowing it.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => setDisplayWidth(entry.contentRect.width));
    observer.observe(wrap);
    setDisplayWidth(wrap.clientWidth);
    return () => observer.disconnect();
  }, []);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || displayWidth <= 0) return;
    // Tall portrait targets would run off the screen at full panel width — cap by height instead.
    const maxHeight = 460;
    const widthByHeight = (maxHeight / spec.height) * spec.width;
    const width = Math.min(displayWidth, widthByHeight);
    scaleRef.current = paintPreview(canvas, image, spec, transform, width);
  }, [image, spec, transform, displayWidth]);

  useEffect(() => {
    repaint();
  }, [repaint]);

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!image) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, ox: transform.offsetX, oy: transform.offsetY };
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    // Screen pixels -> output pixels, so panning feels identical on a 512px icon and a 2880px shot.
    const k = scaleRef.current || 1;
    onTransform({
      ...transform,
      offsetX: drag.ox + (event.clientX - drag.x) / k,
      offsetY: drag.oy + (event.clientY - drag.y) / k,
    });
  }

  function endDrag(event: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    if (!image) return;
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    onTransform({ ...transform, zoom: clampZoom(transform.zoom * factor) });
  }

  return (
    <div ref={wrapRef} className={cn("flex flex-col items-center gap-3", className)}>
      <div className="flex w-full justify-center rounded-lg border bg-[repeating-conic-gradient(hsl(var(--muted))_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-3">
        {image ? (
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={onWheel}
            className="cursor-grab touch-none rounded shadow-sm active:cursor-grabbing"
          />
        ) : (
          <div className="flex h-64 w-full items-center justify-center text-sm text-muted-foreground">
            Select a source image to start cropping
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Drag to reposition · Scroll to zoom</p>
    </div>
  );
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function CropControls({
  transform,
  onTransform,
  spec,
  disabled,
}: {
  transform: CropTransform;
  onTransform: (next: CropTransform) => void;
  spec: AssetSpec;
  disabled?: boolean;
}) {
  const set = (patch: Partial<CropTransform>) => onTransform({ ...transform, ...patch });

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => set({ zoom: clampZoom(transform.zoom * 1.2) })}>
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => set({ zoom: clampZoom(transform.zoom / 1.2) })}>
        <ZoomOut className="h-4 w-4" />
      </Button>
      <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
        {Math.round(transform.zoom * 100)}%
      </span>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => set({ rotation: (transform.rotation + 90) % 360 })}>
        <RotateCw className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => set({ rotation: (transform.rotation + 270) % 360 })}
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant={transform.mode === "CONTAIN" ? "default" : "outline"}
        disabled={disabled}
        onClick={() => set({ mode: "CONTAIN", zoom: 1, offsetX: 0, offsetY: 0 })}
        title="Fit the whole image inside the frame"
      >
        <Minimize2 className="mr-1 h-3.5 w-3.5" />
        Fit
      </Button>
      <Button
        size="sm"
        variant={transform.mode === "COVER" ? "default" : "outline"}
        disabled={disabled}
        onClick={() => set({ mode: "COVER", zoom: 1, offsetX: 0, offsetY: 0 })}
        title="Fill the frame, cropping the overflow"
      >
        <Maximize2 className="mr-1 h-3.5 w-3.5" />
        Fill
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => set({ zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, mode: "COVER" })}
      >
        <RefreshCw className="mr-1 h-3.5 w-3.5" />
        Reset
      </Button>
      {spec.transparency !== "REQUIRED" && (
        <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          Background
          <input
            type="color"
            value={transform.background === "transparent" ? "#ffffff" : transform.background}
            disabled={disabled}
            onChange={(event) => set({ background: event.target.value })}
            className="h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5"
          />
        </label>
      )}
      {spec.transparency !== "FORBIDDEN" && (
        <Button
          size="sm"
          variant={transform.background === "transparent" ? "default" : "outline"}
          disabled={disabled}
          onClick={() => set({ background: transform.background === "transparent" ? "#ffffff" : "transparent" })}
          title="Keep the background transparent (PNG only)"
        >
          Transparent
        </Button>
      )}
    </div>
  );
}
