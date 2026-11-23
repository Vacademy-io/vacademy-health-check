// Run: npm test
// Guard for the PM View isolation rule (docs/command-center/PM_View_Plan.md, section 0):
// PM View code may READ platform data but must never WRITE to the platform backend.
// Every write must go to the PM store (/pm-api/v1), which is separate from the platform.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rel = (p: string) => path.relative(root, p);

const PM_FILES = [
  ...readdirSync(path.join(root, "src/components/pm")).map((f) => path.join(root, "src/components/pm", f)),
  path.join(root, "src/pages/PmViewPage.tsx"),
  path.join(root, "src/lib/pm-view.ts"),
  path.join(root, "src/lib/pm-record.ts"),
  path.join(root, "src/services/pm-api.ts"),
  // Existing tabs shown inside the PM View must stay read-only too.
  path.join(root, "src/components/command-center/AnalyticsTab.tsx"),
  path.join(root, "src/components/command-center/OverviewTab.tsx"),
  path.join(root, "src/components/command-center/RevenueTab.tsx"),
  path.join(root, "src/components/command-center/TrialsPaidTab.tsx"),
];

/** Read-only hooks the PM View may import from platform services. Anything else needs review. */
const ALLOWED_SERVICE_IMPORTS: Record<string, string[]> = {
  "pm-api": ["*"],
  "ga-api": ["useGaReport", "GaProductReport", "GaReport", "GaSourceRow", "GaDay", "GaSplitRow", "GaTotals"],
  "command-center-api": ["useRecentQuotes", "useTaggedTrials", "useAllInstituteDates", "useStageTotals", "QUOTE_FETCH_LIMIT", "TAGGED_TRIAL_LIMIT"],
  "plans-api": ["useSubscriptions"],
  "dashboard-api": ["useActivityTrends", "useActiveUsers", "usePlatformDashboard"],
  "onboarding-api": ["useSubmissionCounts"],
};

test("PM View files only import read-only platform hooks", () => {
  const problems: string[] = [];
  for (const file of PM_FILES) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']@\/services\/([\w-]+)["']/g)) {
      const allowed = ALLOWED_SERVICE_IMPORTS[m[2]];
      if (!allowed) {
        problems.push(`${rel(file)} imports from @/services/${m[2]}`);
        continue;
      }
      if (allowed.includes("*")) continue;
      for (const name of m[1].split(",").map((s) => s.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0].trim()).filter(Boolean)) {
        if (!allowed.includes(name)) problems.push(`${rel(file)} imports ${name} from @/services/${m[2]}`);
      }
    }
    // Default imports / namespace imports from services would bypass the named check above.
    if (/import\s+(?!type\b)(?:\*\s+as\s+\w+|\w+)\s+from\s+["']@\/services\//.test(src)) problems.push(`${rel(file)} has a default or namespace import from a service`);
  }
  assert.deepEqual(problems, [], "PM View must not import platform write hooks");
});

test("PM View files never call the platform with POST/PUT/PATCH/DELETE", () => {
  const problems: string[] = [];
  for (const file of PM_FILES) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bapi\.(post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*([^,)]+)/g)) {
      if (!/^`\$\{PM_API\}/.test(m[2].trim())) problems.push(`${rel(file)}: api.${m[1]}(${m[2].trim()})`);
    }
    if (/\bfetch\s*\(/.test(src)) problems.push(`${rel(file)} calls fetch() directly`);
    if (/\bprovisionDemo\b|\buseBulkUpdateLeadTag\b|\buseCreateSubscription\b|\busePatchSubscription\b|\buseCancelSubscription\b/.test(src))
      problems.push(`${rel(file)} references a platform write function`);
  }
  assert.deepEqual(problems, []);
});

test("the PM store base path is separate from every platform service prefix", () => {
  const src = readFileSync(path.join(root, "src/services/pm-api.ts"), "utf8");
  assert.match(src, /export const PM_API = "\/pm-api\/v1";/);
  const fn = readFileSync(path.join(root, "functions/[[route]].ts"), "utf8");
  const services = /const SERVICES = \[([\s\S]*?)\]/.exec(fn)?.[1] ?? "";
  assert.ok(!services.includes("/pm-api"), "the PM store must not be proxied to the platform backend");
});
