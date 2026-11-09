// Shared with tests (tsconfig.node.json has no "@/" alias), so this file must not
// import anything through "@/".

export interface SpendBreakdownRow {
  bucket: string;
  /** A vendor value, as vendorName reads it, or a feature's label. */
  series: string;
  cost_usd: number;
  credits: number;
}
