export const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toFixed(n !== 0 && n < 0.01 ? 6 : 2)}`;

export const credits = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const count = (n: number | null | undefined) => Number(n ?? 0).toLocaleString();

export const dateTime = (v: string) => new Date(v).toLocaleString();

export const errorText = (error: unknown) => {
  const e = error as {
    response?: { status?: number; data?: { error?: string; detail?: string } };
    message?: string;
  };
  return (
    e?.response?.data?.error ??
    e?.response?.data?.detail ??
    (e?.response?.status ? `HTTP ${e.response.status}` : e?.message ?? "Request failed")
  );
};

/** Filter options from what is on screen, keeping the active filter when no row matches it. */
export const optionsFrom = (values: Array<string | null | undefined>, selected?: string) =>
  [...new Set([...values, selected].filter((v): v is string => !!v))].sort();
