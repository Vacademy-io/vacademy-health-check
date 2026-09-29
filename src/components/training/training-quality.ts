import { SYNONYM_GROUPS, parseTitle, stem, words } from "@/lib/training-search";
import type { TrainingVideoDto } from "@/services/training-videos-api";

/** English labels for the search engine's synonym groups (the admin app translates these). */
export const GROUP_LABELS: Record<string, string> = {
  liveClasses: "Live classes", webinars: "Webinars", students: "Students", teachers: "Teachers & admins",
  enrolling: "Enrolling students", tests: "Tests & assessments", quizzes: "Quizzes", questions: "Questions",
  assignments: "Assignments", evaluation: "Checking answer copies", payments: "Fees & payments",
  coupons: "Coupons & discounts", doubts: "Doubts", attendance: "Attendance", recordings: "Recordings",
  reports: "Reports & tracking", content: "Learning content", structure: "Course structure",
  courses: "Courses & batches", scheduling: "Scheduling", bulk: "In bulk", ai: "AI", coding: "Coding",
  terminology: "Renaming terms", feedback: "Feedback", classLink: "Class link", hosting: "Hosting a class",
  learnerView: "Learner view", registration: "Registration", certificates: "Certificates",
  publishing: "Publishing", notes: "Notes", engagement: "Engagement", leads: "Leads & enquiries",
  audience: "Audience lists", whatsapp: "WhatsApp", messages: "Messages", email: "Email",
  campaigns: "Campaigns & automations", followUps: "Follow-ups", calls: "Calls", counsellors: "Counsellors",
  pipeline: "Pipeline stages",
};

export const DEFAULT_MODULES = ["LMS", "CRM", "AI"];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Step shown to admins: explicit sortOrder, else the legacy "3. " prefix in the title. */
export function stepOf(v: Pick<TrainingVideoDto, "title" | "sortOrder">): number | null {
  return v.sortOrder && v.sortOrder > 0 ? v.sortOrder : parseTitle(v.title).step;
}

export interface QualityIssue {
  label: string;
  hint: string;
}

/** Things that make a video harder to find in the admin Training popup. */
export function qualityIssues(v: TrainingVideoDto, all: TrainingVideoDto[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const clean = parseTitle(v.title).title;
  if (!v.keywords?.length)
    issues.push({ label: "No keywords", hint: "Add words admins might type — synonyms, Hinglish, old names." });
  if (!v.description?.trim())
    issues.push({ label: "No topics", hint: "List what the video covers, separated by ';' — each topic is searchable." });
  if (!v.sortOrder && parseTitle(v.title).step != null)
    issues.push({ label: "Step in name", hint: "Open and save — the number moves to the Step field and the name gets clean." });
  const l3 = v.modulePath[2];
  if (l3 && (squash(clean).includes(squash(parseTitle(l3).title)) || squash(parseTitle(l3).title).includes(squash(clean))))
    issues.push({ label: "Name repeated as folder", hint: "The 3rd path level just repeats the name — clear it." });
  const twins = all.filter(
    (o) => o.id !== v.id && o.modulePath[0] === v.modulePath[0] && squash(parseTitle(o.title).title) === squash(clean)
  );
  if (twins.length)
    issues.push({
      label: "Duplicate",
      hint: `Also uploaded under ${twins.map((t) => t.modulePath.slice(1, 2).join("")).join(", ")} — admins see it once; keep one copy.`,
    });
  const sectionNumbered = all.some(
    (o) => o.modulePath[0] === v.modulePath[0] && o.modulePath[1] === v.modulePath[1] && stepOf(o) != null
  );
  if (sectionNumbered && stepOf(v) == null)
    issues.push({ label: "No step", hint: "Other videos in this section are numbered — give this one a step too." });
  return issues;
}

/**
 * Words the admin search already treats as meaning the same thing as words in this video —
 * no need to add them as keywords. Weak verbs ("create", "see") are left out.
 */
export function understoodAutomatically(text: string, keywords: string[]): string[] {
  const own = new Set([...words(text), ...keywords.flatMap(words)].map(stem));
  const out: string[] = [];
  for (const g of SYNONYM_GROUPS) {
    if (g.weak || !g.words.some((w) => own.has(stem(w)))) continue;
    for (const w of g.words) if (!own.has(stem(w)) && !out.includes(w)) out.push(w);
  }
  return out;
}
