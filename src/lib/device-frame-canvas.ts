/**
 * Device mock-ups for the asset studio — the canvas half.
 *
 * `DeviceFrame.tsx` draws the same hardware in the DOM, but a DOM frame stops at the edge of the
 * screen: the file that reaches the store is whatever `renderToCanvas` painted, so a preview that
 * looks like a phone downloads as a bare screenshot. This module redraws that chrome with canvas
 * primitives so the mock-up can be *part of the asset* when the user asks for it.
 *
 * The output stays exactly `spec.width × spec.height` — the store's requirement never moves. What
 * changes is the composition inside it: the mock-up is fitted into the slot with a margin, and the
 * crop is painted into the screen cut-out at the same aspect ratio it would have filled unframed.
 * That last part is what keeps the cropper honest — the screen is a scaled copy of the plain
 * output, so dragging and zooming mean the same thing either way.
 *
 * Only real hardware is bakeable. Icons and feature graphics are deliberately excluded: both
 * stores apply their own mask and Apple rejects alpha outright, so a pre-rounded icon ships white
 * corners into the store listing.
 */

import { FRAME_METRICS, type DeviceKind } from "@/lib/device-frames";

const BAKEABLE: DeviceKind[] = ["android-phone", "iphone", "android-tablet", "ipad", "mac", "windows"];

export function canBakeFrame(kind: DeviceKind): boolean {
  return BAKEABLE.includes(kind);
}

/** Corner radii as a fraction of the mock-up's width — the cqw numbers `DeviceFrame` uses. */
const RADII: Partial<Record<DeviceKind, { outer: number; screen: number }>> = {
  iphone: { outer: 0.12, screen: 0.096 },
  "android-phone": { outer: 0.1, screen: 0.076 },
  "android-tablet": { outer: 0.046, screen: 0.026 },
  ipad: { outer: 0.046, screen: 0.026 },
  mac: { outer: 0.018, screen: 0.009 },
  windows: { outer: 0.014, screen: 0 },
};

/** Breathing room around the mock-up, as a fraction of the slot's shorter side. */
export const DEFAULT_MOCK_PADDING = 0.05;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MockLayout {
  kind: DeviceKind;
  /** The whole mock-up, chrome included. */
  frame: Box;
  /** The device body: for a MacBook this is the lid only, with the base sitting below it. */
  body: Box;
  /** The screen cut-out the crop is painted into. Always the slot's own aspect ratio. */
  screen: Box;
  /** `screen.width / spec.width` — how much the composition shrinks to sit inside the device. */
  scale: number;
  /** One cqw in output pixels, so every measurement below reads like the CSS it mirrors. */
  unit: number;
}

/**
 * Works out where the device sits inside the output rectangle.
 *
 * The screen keeps the slot's aspect ratio, so the mock-up's own ratio is always a little wider
 * than the slot — fit by whichever axis binds first and centre what's left.
 */
export function mockLayout(
  kind: DeviceKind,
  spec: { width: number; height: number },
  padding = DEFAULT_MOCK_PADDING
): MockLayout | null {
  if (!canBakeFrame(kind)) return null;
  const m = FRAME_METRICS[kind];
  const pad = Math.min(spec.width, spec.height) * padding;
  const availableW = spec.width - 2 * pad;
  const availableH = spec.height - 2 * pad;
  if (availableW <= 0 || availableH <= 0) return null;

  const ratio = spec.height / spec.width;
  const factor = 2 * m.bezel + m.extraTop + m.extraBottom + (1 - 2 * m.bezel) * ratio;
  const width = Math.min(availableW, availableH / factor);
  const height = width * factor;
  const x = (spec.width - width) / 2;
  const y = (spec.height - height) / 2;

  const screenWidth = width * (1 - 2 * m.bezel);
  const screenHeight = screenWidth * ratio;
  const screen: Box = {
    x: x + width * m.bezel,
    y: y + width * (m.bezel + m.extraTop),
    width: screenWidth,
    height: screenHeight,
  };

  // The lid ends above the base on a MacBook; every other device is one solid body.
  const bodyHeight = kind === "mac" ? height - width * m.extraBottom : height;

  return {
    kind,
    frame: { x, y, width, height },
    body: { x, y, width, height: bodyHeight },
    screen,
    scale: screenWidth / spec.width,
    unit: width / 100,
  };
}

/* ------------------------------------------------------------------- paths */

type Radii = number | [number, number, number, number];

function roundRectPath(ctx: CanvasRenderingContext2D, box: Box, radii: Radii) {
  const { x, y, width: w, height: h } = box;
  const limit = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = (Array.isArray(radii) ? radii : [radii, radii, radii, radii]).map((r) =>
    Math.max(0, Math.min(r, limit))
  );
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

function fillRoundRect(ctx: CanvasRenderingContext2D, box: Box, radii: Radii, fill: string | CanvasGradient) {
  roundRectPath(ctx, box, radii);
  ctx.fillStyle = fill;
  ctx.fill();
}

function verticalGradient(ctx: CanvasRenderingContext2D, box: Box, stops: Array<[number, string]>): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, box.y, 0, box.y + box.height);
  for (const [at, colour] of stops) gradient.addColorStop(at, colour);
  return gradient;
}

function dot(ctx: CanvasRenderingContext2D, cx: number, cy: number, diameter: number, fill: string) {
  ctx.beginPath();
  ctx.arc(cx, cy, diameter / 2, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Restricts drawing to the screen cut-out, so the crop can't spill over the bezel. */
export function clipScreen(ctx: CanvasRenderingContext2D, layout: MockLayout) {
  const radius = (RADII[layout.kind]?.screen ?? 0) * layout.frame.width;
  roundRectPath(ctx, layout.screen, radius);
  ctx.clip();
}

/* ------------------------------------------------------------------ chrome */

/** Everything behind the crop: the body, the base, the title bar and the black screen. */
export function paintChrome(ctx: CanvasRenderingContext2D, layout: MockLayout) {
  const { kind, body, screen, unit } = layout;
  const m = FRAME_METRICS[kind];
  const radii = RADII[kind] ?? { outer: 0, screen: 0 };
  const outerRadius = radii.outer * layout.frame.width;
  const screenRadius = radii.screen * layout.frame.width;

  ctx.save();
  // A flat rectangle on a flat background reads as a sticker; the drop shadow is what makes the
  // device sit on the page. Cleared straight afterwards so it never bleeds onto the detail work.
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 3.2 * unit;
  ctx.shadowOffsetY = 1.4 * unit;

  if (kind === "windows") {
    fillRoundRect(ctx, body, outerRadius, "#f5f5f5");
  } else if (kind === "mac") {
    fillRoundRect(
      ctx,
      body,
      outerRadius,
      verticalGradient(ctx, body, [
        [0, "#737373"],
        [0.5, "#262626"],
        [1, "#404040"],
      ])
    );
  } else {
    fillRoundRect(
      ctx,
      body,
      outerRadius,
      verticalGradient(ctx, body, [
        [0, "#525252"],
        [0.5, "#171717"],
        [1, "#404040"],
      ])
    );
  }
  ctx.restore();

  if (kind === "windows") {
    ctx.strokeStyle = "#d4d4d4";
    ctx.lineWidth = Math.max(1, 0.16 * unit);
    roundRectPath(ctx, body, outerRadius);
    ctx.stroke();
    paintWindowsTitleBar(ctx, layout, m.extraTop * layout.frame.width);
  } else {
    // The ring-1 black/30 that separates the body from a dark background.
    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = Math.max(1, 0.16 * unit);
    roundRectPath(ctx, body, outerRadius);
    ctx.stroke();
  }

  if (kind === "mac") paintMacBase(ctx, layout);

  // The screen itself starts black — a CONTAIN crop letterboxes onto whatever the user painted.
  fillRoundRect(ctx, screen, screenRadius, "#000000");

  // Cameras that live in the chrome rather than over the screen.
  const bezelMid = body.y + (m.bezel * layout.frame.width) / 2;
  if (kind === "android-tablet" || kind === "ipad") {
    dot(ctx, body.x + body.width / 2, bezelMid, 1.1 * unit, "#525252");
  } else if (kind === "mac") {
    dot(ctx, body.x + body.width / 2, bezelMid, 0.7 * unit, "#525252");
  }
}

function paintWindowsTitleBar(ctx: CanvasRenderingContext2D, layout: MockLayout, barHeight: number) {
  const { body, unit } = layout;
  const padX = 1.8 * unit;
  const middle = body.y + barHeight / 2;

  const pillHeight = barHeight * 0.3;
  const pillWidth = body.width * 0.16;
  fillRoundRect(
    ctx,
    { x: body.x + padX, y: middle - pillHeight / 2, width: pillWidth, height: pillHeight },
    pillHeight / 2,
    "#d4d4d4"
  );

  const hairline = Math.max(1, 0.16 * unit);
  ctx.strokeStyle = "#737373";
  ctx.lineWidth = hairline;
  // minimise · maximise · close, right-aligned with the 2.4cqw gaps the DOM frame uses.
  let x = body.x + body.width - padX - (1.5 + 2.4 + 1.3 + 2.4 + 1.5) * unit;
  ctx.beginPath();
  ctx.moveTo(x, middle);
  ctx.lineTo(x + 1.5 * unit, middle);
  ctx.stroke();
  x += (1.5 + 2.4) * unit;
  ctx.strokeRect(x, middle - 0.65 * unit, 1.3 * unit, 1.3 * unit);
  x += (1.3 + 2.4) * unit;
  ctx.beginPath();
  ctx.moveTo(x, middle - 0.75 * unit);
  ctx.lineTo(x + 1.5 * unit, middle + 0.75 * unit);
  ctx.moveTo(x + 1.5 * unit, middle - 0.75 * unit);
  ctx.lineTo(x, middle + 0.75 * unit);
  ctx.stroke();
}

/** The lid alone reads as a tablet — the base is what makes it a MacBook. */
function paintMacBase(ctx: CanvasRenderingContext2D, layout: MockLayout) {
  const { frame, body, unit } = layout;
  const height = frame.height - body.height;
  if (height <= 0) return;
  const base: Box = {
    x: frame.x - frame.width * 0.02,
    y: body.y + body.height,
    width: frame.width * 1.04,
    height,
  };
  const radius = 1.4 * unit;
  fillRoundRect(
    ctx,
    base,
    [0, 0, radius, radius],
    verticalGradient(ctx, base, [
      [0, "#d4d4d4"],
      [1, "#a3a3a3"],
    ])
  );

  const notchWidth = base.width * 0.12;
  const notchHeight = height * 0.5;
  fillRoundRect(
    ctx,
    { x: base.x + (base.width - notchWidth) / 2, y: base.y, width: notchWidth, height: notchHeight },
    [0, 0, notchHeight, notchHeight],
    "rgba(163, 163, 163, 0.8)"
  );
}

/* ----------------------------------------------------------------- overlay */

/** Everything that sits on top of the crop: the notch, the punch-hole and the side buttons. */
export function paintOverlay(ctx: CanvasRenderingContext2D, layout: MockLayout) {
  const { kind, body, screen, unit } = layout;

  if (kind === "iphone") {
    const notchWidth = 27 * unit;
    const notchHeight = 7.2 * unit;
    fillRoundRect(
      ctx,
      {
        x: screen.x + screen.width / 2 - notchWidth / 2,
        y: screen.y + 1.6 * unit,
        width: notchWidth,
        height: notchHeight,
      },
      notchHeight / 2,
      "#000000"
    );
  }

  if (kind === "android-phone") {
    const size = 2.6 * unit;
    const cx = screen.x + screen.width / 2;
    const cy = screen.y + 1.9 * unit + size / 2;
    dot(ctx, cx, cy, size, "#000000");
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = Math.max(1, 0.16 * unit);
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (kind !== "iphone" && kind !== "android-phone") return;

  const buttonWidth = 0.55 * unit;
  const right = body.x + body.width - buttonWidth;
  const button = (x: number, topFraction: number, heightFraction: number, fill: string) =>
    fillRoundRect(
      ctx,
      { x, y: body.y + body.height * topFraction, width: buttonWidth, height: body.height * heightFraction },
      buttonWidth / 2,
      fill
    );

  button(right, 0.17, 0.06, "rgba(255, 255, 255, 0.25)");
  button(right, 0.27, 0.1, "rgba(255, 255, 255, 0.25)");
  button(body.x, 0.21, 0.08, "rgba(255, 255, 255, 0.2)");
}
