import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, RotateCw, RotateCcw, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { paintPreview, type CropTransform, type LoadedImage } from "@/lib/image-processing";
import type { AssetSpec } from "@/lib/platform-requirements";
import { DeviceFrame } from "@/components/apps/DeviceFrame";
import { CHECKER, frameWidthForHeight, type DeviceKind } from "@/lib/device-frames";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;
const MAX_PREVIEW_HEIGHT = 460;

interface CropCanvasProps {
  image: LoadedImage | null;
  spec: AssetSpec;
  transform: CropTransform;
  onTransform: (next: CropTransform) => void;
  className?: string;
  /** Draw the crop inside the hardware it ships to. "plain" keeps the bare checkerboard. */
  frame?: DeviceKind;
  /**
   * Paint the mock-up *into* the canvas instead of around it, because the generated file will
   * carry it. Pass this and `frame` together only if you want two frames.
   */
  bake?: DeviceKind;
}

/**
 * The crop canvas (§8). Drag to pan, wheel to zoom, and what you see is exactly the file that
 * gets generated — the preview runs the same painter as the exporter, only scaled down.
 */
export function CropCanvas({
  image,
  spec,
  transform,
  onTransform,
  className,
  frame = "plain",
  bake = "plain",
}: CropCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [displayWidth, setDisplayWidth] = useState(0);

  // Measured on the element that actually holds the canvas — inside any bezel and padding — so the
  // canvas fills the screen area exactly instead of overflowing it by the chrome's width.
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
    scaleRef.current = paintPreview(canvas, image, spec, transform, displayWidth, bake);
  }, [image, spec, transform, displayWidth, bake]);

  // Tall portrait targets would run off the panel at full width, so cap the whole mock-up — chrome
  // included — by height. The wrapper carries the cap; the measured screen inherits it.
  const maxWidth = Math.round(frameWidthForHeight(frame, spec, MAX_PREVIEW_HEIGHT));

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

  const surface = (
    <div ref={wrapRef} className="w-full">
      {image ? (
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={onWheel}
          className="block cursor-grab touch-none active:cursor-grabbing"
        />
      ) : (
        // Keep the slot's own aspect ratio while it's empty, so the frame is already the right
        // shape and the panel doesn't jump the moment a source is picked.
        <div
          className={cn(
            "flex items-center justify-center px-4 text-center text-sm",
            frame === "plain" ? "text-muted-foreground" : "text-white/60"
          )}
          style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
        >
          Select a source image to start cropping
        </div>
      )}
    </div>
  );

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="w-full" style={{ maxWidth: `${maxWidth}px` }}>
        {frame === "plain" ? (
          <div className={cn("flex w-full justify-center rounded-lg border p-3", CHECKER)}>{surface}</div>
        ) : (
          <DeviceFrame kind={frame}>{surface}</DeviceFrame>
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
