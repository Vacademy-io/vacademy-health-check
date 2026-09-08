/**
 * Device mock-ups for the asset studio — the data half.
 *
 * A store asset is a flat rectangle of pixels, which tells you nothing about whether it will look
 * right on the device it is destined for. `DeviceFrame` wraps a *preview* — the crop canvas, the
 * pending render, the gallery, the lightbox — in the hardware the asset actually ships to, so a
 * phone screenshot reads as a phone and a Mac screenshot reads as a MacBook.
 *
 * Everything here is decoration. The frame is never painted into the canvas and never reaches the
 * generated file: the bytes uploaded to the store are exactly what `renderToCanvas` produced.
 */

import type { AssetSpec } from "@/lib/platform-requirements";

export type DeviceKind =
  | "android-phone"
  | "android-tablet"
  | "iphone"
  | "ipad"
  | "mac"
  | "windows"
  | "icon-android"
  | "icon-apple"
  | "icon-windows"
  | "banner"
  | "plain";

export const DEVICE_LABELS: Record<DeviceKind, string> = {
  "android-phone": "Android phone",
  "android-tablet": "Android tablet",
  iphone: "iPhone",
  ipad: "iPad",
  mac: "MacBook",
  windows: "Windows",
  "icon-android": "Home screen",
  "icon-apple": "Home screen",
  "icon-windows": "Store tile",
  banner: "Store banner",
  plain: "No frame",
};

/**
 * Chrome thickness as a fraction of the frame's total width — the numbers the cqw styles below are
 * built from, exported so callers can work out how wide a frame may be before it runs off screen.
 */
export const FRAME_METRICS: Record<DeviceKind, { bezel: number; extraTop: number; extraBottom: number }> = {
  "android-phone": { bezel: 0.026, extraTop: 0, extraBottom: 0 },
  iphone: { bezel: 0.028, extraTop: 0, extraBottom: 0 },
  "android-tablet": { bezel: 0.042, extraTop: 0, extraBottom: 0 },
  ipad: { bezel: 0.042, extraTop: 0, extraBottom: 0 },
  mac: { bezel: 0.018, extraTop: 0, extraBottom: 0.032 },
  windows: { bezel: 0.006, extraTop: 0.05, extraBottom: 0.006 },
  "icon-android": { bezel: 0, extraTop: 0, extraBottom: 0 },
  "icon-apple": { bezel: 0, extraTop: 0, extraBottom: 0 },
  "icon-windows": { bezel: 0, extraTop: 0, extraBottom: 0 },
  banner: { bezel: 0, extraTop: 0, extraBottom: 0 },
  plain: { bezel: 0, extraTop: 0, extraBottom: 0 },
};

/** Which mock-up an asset slot belongs in. Screenshot slots carry the device in their id. */
export function deviceForSpec(spec: Pick<AssetSpec, "id" | "group" | "platform">): DeviceKind {
  if (spec.group === "icon") {
    if (spec.platform === "ANDROID") return "icon-android";
    if (spec.platform === "WINDOWS") return "icon-windows";
    return "icon-apple";
  }
  if (spec.group === "graphic") return "banner";
  if (spec.id.includes("ipad")) return "ipad";
  if (spec.id.includes("tablet")) return spec.platform === "ANDROID" ? "android-tablet" : "windows";
  switch (spec.platform) {
    case "IOS":
      return "iphone";
    case "MACOS":
      return "mac";
    case "WINDOWS":
      return "windows";
    default:
      return "android-phone";
  }
}

/**
 * The widest a framed asset may be drawn before the whole mock-up — chrome included — exceeds
 * `maxHeight`. Tall phone screenshots inside a bezel would otherwise run off the panel.
 */
export function frameWidthForHeight(kind: DeviceKind, spec: { width: number; height: number }, maxHeight: number): number {
  const m = FRAME_METRICS[kind];
  const ratio = spec.height / spec.width;
  const factor = 2 * m.bezel + m.extraTop + m.extraBottom + (1 - 2 * m.bezel) * ratio;
  return factor > 0 ? maxHeight / factor : maxHeight;
}

/** Transparent artwork needs something behind it or "no background" looks like "black background". */
export const CHECKER =
  "bg-[repeating-conic-gradient(hsl(var(--muted))_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]";
