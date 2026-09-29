import { useState } from "react";
import { BookOpenCheck, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const STORAGE_KEY = "training-guide-collapsed";

const RULES: Array<{ title: string; body: string; example: string }> = [
  {
    title: "1. Module → Section",
    body: "Module is the product area (LMS, CRM, AI). Section is the shelf admins browse inside it (Live Sessions, Leads & Enquiries). Pick existing names from the suggestions — a typo creates a new section.",
    example: "LMS → Live Sessions   ·   CRM → Leads & Enquiries",
  },
  {
    title: "2. Name = the task, in plain words",
    body: "Write what the admin is trying to do. No step number in the name — use the Step field. Don't repeat the name as a 3rd path level.",
    example: "Schedule a live class for your batch",
  },
  {
    title: "3. Step = watch order",
    body: "Number videos that build on each other (1, 2, 3 …). Admins see the section as a numbered path with progress, and the first numbered section becomes their “Start here”.",
    example: "Courses/Batch: 1 Create your first course → 2 Build the structure → 3 Add content …",
  },
  {
    title: "4. Description = topics",
    body: "List what the video covers, separated by “;”. Each topic becomes a chip under the video and is searchable. Use “→” for a step-by-step flow.",
    example: "Select batch, date, time; recurring weekly classes; reminder emails; edit or delete a class",
  },
  {
    title: "5. Keywords = how admins actually ask",
    body: "Add 5–15 words or phrases that are NOT already in the name or topics: customer wording, Hindi/Hinglish, old feature names, common misspellings. Common synonyms (fees ↔ payment, homework ↔ assignment, class ↔ session) are already understood — the form shows which.",
    example: "fees kaise le · shulk · online payment · razorpay · sell course",
  },
  {
    title: "6. Write with the default terms",
    body: "Use Course, Batch, Student, Live Session in names and topics. Every institute automatically sees its own words from Naming Settings (e.g. Programme, Cohort) — and search works with both.",
    example: "“Turn your course into a paid course” reads “Turn your programme into a paid programme” where Course was renamed",
  },
];

export function TrainingPublishingGuide() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");
  const toggle = () => {
    const next = !collapsed;
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    setCollapsed(next);
  };
  return (
    <Card className="mb-4">
      <button type="button" onClick={toggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <BookOpenCheck className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">How to publish so admins can find it</span>
          <span className="block text-xs text-muted-foreground">
            Admins browse Module → Section → Step, or search in their own words (English, Hinglish, typos). Six rules.
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${collapsed ? "" : "rotate-180"}`} />
      </button>
      {collapsed ? null : (
        <CardContent className="grid gap-3 border-t pt-4 md:grid-cols-2 xl:grid-cols-3">
          {RULES.map((r) => (
            <div key={r.title} className="rounded-md border bg-muted/30 p-3">
              <p className="text-sm font-semibold">{r.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.body}</p>
              <p className="mt-2 rounded bg-background px-2 py-1 font-mono text-[11px] text-foreground/80">{r.example}</p>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
