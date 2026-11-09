// Live Pulse "Active Users Now" — turns raw (user, institute) pairs into the
// per-institute table and a de-duplicated headline total.
//
// Why pairs and not a per-institute GROUP BY: one person shows up in
// user_activity_log under several institute values at once. The learner app
// sends `clientId: ""` on /open/ calls and some callers send no clientId at all,
// so the backend logs those hits with a blank institute or the literal string
// "null". Summing per-institute counts then counts the same learner two or three
// times, and the blank rows surface as an "Unattributed" bucket that is really
// learners already counted under their own institute.

export interface ActivePair {
  user_id: string;
  /** Already normalised by the query: blank / "null" / "undefined" arrive as null. */
  institute_id: string | null;
}

export interface ActiveInstituteRow {
  /** null = the user was only ever seen without an institute. */
  institute_id: string | null;
  users: number;
}

export interface ActiveSummary {
  rows: ActiveInstituteRow[];
  /** Distinct people across every row shown. */
  total: number;
}

const MISSING = new Set(["", "null", "undefined"]);

/** Treats blank, "null" and "undefined" (any case, any padding) as no institute. */
export function normalizeInstituteId(id: string | null | undefined): string | null {
  if (id == null) return null;
  const trimmed = id.trim();
  return MISSING.has(trimmed.toLowerCase()) ? null : trimmed;
}

/**
 * @param pairs     distinct (user, institute) pairs from the last 15 minutes
 * @param isShown   whether an institute passes the current filter (e.g. not TEST/LEAD)
 */
export function summarizeActive(
  pairs: ReadonlyArray<ActivePair>,
  isShown: (instituteId: string) => boolean,
): ActiveSummary {
  const byInstitute = new Map<string, Set<string>>();
  const withAnyInstitute = new Set<string>(); // includes filtered-out institutes
  const withoutInstitute = new Set<string>();

  for (const pair of pairs) {
    const instituteId = normalizeInstituteId(pair.institute_id);
    if (instituteId === null) {
      withoutInstitute.add(pair.user_id);
      continue;
    }
    withAnyInstitute.add(pair.user_id);
    if (!isShown(instituteId)) continue;
    let users = byInstitute.get(instituteId);
    if (!users) byInstitute.set(instituteId, (users = new Set()));
    users.add(pair.user_id);
  }

  // A user with a blank row is only "unattributed" when no institute claims
  // them — not even a hidden test institute (then they are a test user).
  const unattributed = [...withoutInstitute].filter((u) => !withAnyInstitute.has(u));

  const counted = new Set<string>(unattributed);
  const rows: ActiveInstituteRow[] = [];
  for (const [instituteId, users] of byInstitute) {
    rows.push({ institute_id: instituteId, users: users.size });
    for (const u of users) counted.add(u);
  }
  if (unattributed.length) rows.push({ institute_id: null, users: unattributed.length });

  // Busiest first; on a tie the unattributed row goes below real institutes.
  rows.sort(
    (a, b) =>
      b.users - a.users ||
      Number(a.institute_id === null) - Number(b.institute_id === null) ||
      String(a.institute_id).localeCompare(String(b.institute_id)),
  );
  return { rows, total: counted.size };
}
