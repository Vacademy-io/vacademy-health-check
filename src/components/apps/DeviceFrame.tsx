import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CHECKER, FRAME_METRICS, type DeviceKind } from "@/lib/device-frames";

/**
 * The mock-up itself.
 *
 * The chrome is drawn in container-query units (`cqw`), so one component scales from a 96px gallery
 * thumbnail to a full-screen lightbox with no size prop and no JS measurement. See
 * `@/lib/device-frames` for which slot maps to which device and how wide a frame may be drawn.
 */
const HAIRLINE = "max(1px, 0.16cqw)";

interface DeviceFrameProps {
  kind: DeviceKind;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function DeviceFrame({ kind, children, className, style }: DeviceFrameProps) {
  if (kind === "plain") {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  const m = FRAME_METRICS[kind];
  const pad = `${(m.bezel * 100).toFixed(2)}cqw`;
  // Half the bezel, in cqw — where a camera dot sits when it lives in the chrome rather than the screen.
  const bezelMid = `${((m.bezel * 100) / 2).toFixed(2)}cqw`;
  const outer: CSSProperties = { containerType: "inline-size", ...style };

  /* ------------------------------------------------------------------ icons */
  if (kind === "icon-android" || kind === "icon-apple" || kind === "icon-windows") {
    // Both stores apply their own mask; showing it is the whole point of previewing an icon.
    const radius = kind === "icon-windows" ? "8%" : kind === "icon-android" ? "23%" : "22.5%";
    return (
      <div className={className} style={outer}>
        <div
          className={cn("overflow-hidden shadow-lg ring-1 ring-black/10 dark:ring-white/10", CHECKER)}
          style={{ borderRadius: radius }}
        >
          {children}
        </div>
      </div>
    );
  }

  /* -------------------------------------------------- feature graphic / tile */
  if (kind === "banner") {
    return (
      <div className={className} style={outer}>
        <div
          className={cn("overflow-hidden shadow-md ring-1 ring-black/10 dark:ring-white/10", CHECKER)}
          style={{ borderRadius: "2.2cqw" }}
        >
          {children}
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- windows */
  if (kind === "windows") {
    return (
      <div className={className} style={outer}>
        <div
          className="overflow-hidden border border-neutral-300 bg-neutral-100 shadow-xl dark:border-neutral-700 dark:bg-neutral-800"
          style={{ borderRadius: "1.4cqw" }}
        >
          <div
            className="flex items-center justify-between"
            style={{ height: `${m.extraTop * 100}cqw`, paddingLeft: "1.8cqw", paddingRight: "1.8cqw" }}
          >
            <span className="rounded-full bg-neutral-300 dark:bg-neutral-600" style={{ width: "16%", height: "30%" }} />
            <span className="flex items-center" style={{ gap: "2.4cqw" }}>
              <span className="bg-neutral-500 dark:bg-neutral-400" style={{ width: "1.5cqw", height: HAIRLINE }} />
              <span
                className="border-neutral-500 dark:border-neutral-400"
                style={{ width: "1.3cqw", height: "1.3cqw", borderWidth: HAIRLINE, borderStyle: "solid" }}
              />
              <span className="relative" style={{ width: "1.5cqw", height: "1.5cqw" }}>
                <span
                  className="absolute left-0 top-1/2 w-full bg-neutral-500 dark:bg-neutral-400"
                  style={{ height: HAIRLINE, transform: "rotate(45deg)" }}
                />
                <span
                  className="absolute left-0 top-1/2 w-full bg-neutral-500 dark:bg-neutral-400"
                  style={{ height: HAIRLINE, transform: "rotate(-45deg)" }}
                />
              </span>
            </span>
          </div>
          <div className="overflow-hidden bg-black">{children}</div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------- mac */
  if (kind === "mac") {
    return (
      <div className={className} style={outer}>
        <div
          className="relative bg-gradient-to-b from-neutral-500 via-neutral-800 to-neutral-700 shadow-xl ring-1 ring-black/30"
          style={{ padding: pad, borderRadius: "1.8cqw" }}
        >
          <div className="relative overflow-hidden bg-black" style={{ borderRadius: "0.9cqw" }}>
            {children}
          </div>
          <span
            className="pointer-events-none absolute left-1/2 rounded-full bg-neutral-600"
            style={{ top: bezelMid, width: "0.7cqw", height: "0.7cqw", transform: "translate(-50%, -50%)" }}
          />
        </div>
        {/* The lid alone reads as a tablet — the base is what makes it a MacBook. */}
        <div
          className="relative bg-gradient-to-b from-neutral-300 to-neutral-400 dark:from-neutral-500 dark:to-neutral-600"
          style={{
            width: "104%",
            marginLeft: "-2%",
            height: `${m.extraBottom * 100}cqw`,
            borderBottomLeftRadius: "1.4cqw",
            borderBottomRightRadius: "1.4cqw",
          }}
        >
          <span
            className="absolute left-1/2 top-0 rounded-b-full bg-neutral-400/80 dark:bg-neutral-700"
            style={{ width: "12%", height: "50%", transform: "translateX(-50%)" }}
          />
        </div>
      </div>
    );
  }

  /* --------------------------------------------------- phones and tablets */
  const isPhone = kind === "android-phone" || kind === "iphone";
  const outerRadius = kind === "iphone" ? "12cqw" : kind === "android-phone" ? "10cqw" : "4.6cqw";
  const screenRadius = kind === "iphone" ? "9.6cqw" : kind === "android-phone" ? "7.6cqw" : "2.6cqw";

  return (
    <div className={className} style={outer}>
      <div
        className="relative bg-gradient-to-b from-neutral-600 via-neutral-900 to-neutral-700 shadow-xl ring-1 ring-black/30"
        style={{ padding: pad, borderRadius: outerRadius }}
      >
        <div className="relative overflow-hidden bg-black" style={{ borderRadius: screenRadius }}>
          {children}
          {kind === "iphone" && (
            <span
              className="pointer-events-none absolute left-1/2 rounded-full bg-black"
              style={{ top: "1.6cqw", width: "27cqw", height: "7.2cqw", transform: "translateX(-50%)" }}
            />
          )}
          {kind === "android-phone" && (
            <span
              className="pointer-events-none absolute left-1/2 rounded-full bg-black ring-1 ring-white/20"
              style={{ top: "1.9cqw", width: "2.6cqw", height: "2.6cqw", transform: "translateX(-50%)" }}
            />
          )}
        </div>

        {!isPhone && (
          <span
            className="pointer-events-none absolute left-1/2 rounded-full bg-neutral-600"
            style={{ top: bezelMid, width: "1.1cqw", height: "1.1cqw", transform: "translate(-50%, -50%)" }}
          />
        )}

        {isPhone && (
          <>
            <span className="pointer-events-none absolute right-0 rounded-l bg-white/25" style={{ top: "17%", height: "6%", width: "0.55cqw" }} />
            <span className="pointer-events-none absolute right-0 rounded-l bg-white/25" style={{ top: "27%", height: "10%", width: "0.55cqw" }} />
            <span className="pointer-events-none absolute left-0 rounded-r bg-white/20" style={{ top: "21%", height: "8%", width: "0.55cqw" }} />
          </>
        )}
      </div>
    </div>
  );
}
