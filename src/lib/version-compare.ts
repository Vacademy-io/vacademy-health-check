/** Numeric-segment version comparison; falls back to treating odd segments as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-+]/).map((s) => parseInt(s, 10));
  const pb = b.split(/[.\-+]/).map((s) => parseInt(s, 10));
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return x - y;
  }
  return 0;
}
