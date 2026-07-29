import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

// ---- types (mirror the community_service onboarding DTOs) -------------------

export type QuestionType =
  | "TEXT"
  | "EMAIL"
  | "PHONE"
  | "TEXTAREA"
  | "URL"
  | "SELECT"
  | "MULTISELECT"
  | "BOOLEAN"
  | "COLOR"
  | "FEATURE_GROUPS";

export interface QuestionOption {
  value: string;
  label: string;
  /** Lucide icon name — group cards only. */
  icon?: string;
  /** One-line summary under the label — group cards only. */
  description?: string;
  /** Features nested inside a group card. */
  children?: QuestionOption[];
}

export interface Question {
  key: string;
  label: string;
  type: QuestionType;
  section: string;
  sectionLabel: string;
  sectionOrder: number;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: QuestionOption[];
  multi: boolean;
  dependsOnKey?: string;
  dependsOnValue?: string;
  drivesDemo: boolean;
  featureFlag?: string;
}

export interface PublicLinkConfig {
  slug: string;
  linkType: "GENERAL" | "CUSTOM" | "DIRECT_DEMO";
  introHeading?: string;
  introSubheading?: string;
  active: boolean;
  expired: boolean;
  forcedInstituteType?: string;
  instituteTypes: QuestionOption[];
  questions: Question[];
  prefilled?: Record<string, unknown>;
}

export interface DemoHandoff {
  instituteType: string;
  instituteTypeLabel: string;
  instituteId: string;
  displayName: string;
  adminUsername?: string;
  adminPassword?: string;
  adminLoginUrl?: string;
  learnerUsername?: string;
  learnerPassword?: string;
  learnerLoginUrl?: string;
}

export interface SubmitResponse {
  submissionId: string;
  handoff: DemoHandoff;
}

export interface OnboardingLink {
  id: string;
  slug: string;
  name: string;
  linkType: "GENERAL" | "CUSTOM" | "DIRECT_DEMO";
  visibleQuestionKeys?: string[];
  prefilledValues?: Record<string, unknown>;
  forcedInstituteType?: string;
  introHeading?: string;
  introSubheading?: string;
  active: boolean;
  expiresAt?: string;
  submissionCount: number;
  createdAt?: string;
  shareUrl: string;
}

export interface UpsertLinkRequest {
  name?: string;
  slug?: string;
  linkType?: string;
  visibleQuestionKeys?: string[];
  prefilledValues?: Record<string, unknown>;
  forcedInstituteType?: string;
  introHeading?: string;
  introSubheading?: string;
  active?: boolean;
  expiresAt?: string;
}

export interface Submission {
  id: string;
  linkSlug?: string;
  linkType?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  organizationName?: string;
  role?: string;
  instituteType?: string;
  instituteTypeLabel?: string;
  source?: string;
  featuresOfInterest?: string[];
  answers?: Record<string, unknown>;
  demoInstituteId?: string;
  status: string;
  emailSent: boolean;
  referrer?: string;
  createdAt?: string;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface DemoAccount {
  id: string;
  instituteType: string;
  instituteTypeLabel: string;
  instituteId: string;
  displayName: string;
  adminUsername?: string;
  adminPassword?: string;
  learnerUsername?: string;
  learnerPassword?: string;
  adminPortalUrl?: string;
  learnerPortalUrl?: string;
  active: boolean;
  sortOrder: number;
}

export interface UpdateDemoAccountRequest {
  displayName?: string;
  adminUsername?: string;
  adminPassword?: string;
  learnerUsername?: string;
  learnerPassword?: string;
  adminPortalUrl?: string;
  learnerPortalUrl?: string;
  active?: boolean;
  syncNameToInstitute?: boolean;
}

export interface Recipient {
  id: string;
  email: string;
  name?: string;
  active: boolean;
  createdAt?: string;
}

// ---- public (unauthenticated) ----------------------------------------------

const PUB = API_PREFIXES.ONBOARDING_PUBLIC;

export async function fetchPublicLink(slug: string): Promise<PublicLinkConfig> {
  const res = await fetch(`${PUB}/link/${encodeURIComponent(slug)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Link not found (${res.status})`);
  return res.json();
}

export async function submitOnboarding(body: {
  slug: string;
  instituteType?: string;
  answers: Record<string, unknown>;
  referrer?: string;
}): Promise<SubmitResponse> {
  const res = await fetch(`${PUB}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Submission failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.message) msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchDirectDemo(instituteType: string): Promise<DemoHandoff> {
  const res = await fetch(`${PUB}/demo/${encodeURIComponent(instituteType)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Demo not available (${res.status})`);
  return res.json();
}

// ---- super-admin (authenticated) -------------------------------------------

const ADM = API_PREFIXES.ONBOARDING_ADMIN;
const K = {
  questions: ["onboarding", "questions"] as const,
  links: ["onboarding", "links"] as const,
  submissions: ["onboarding", "submissions"] as const,
  counts: ["onboarding", "submissions", "counts"] as const,
  demos: ["onboarding", "demo-accounts"] as const,
  recipients: ["onboarding", "recipients"] as const,
};

export function useQuestions() {
  return useQuery({
    queryKey: K.questions,
    queryFn: async () => (await api.get<Question[]>(`${ADM}/questions`)).data,
    staleTime: 5 * 60_000,
  });
}

export function useLinks() {
  return useQuery({
    queryKey: K.links,
    queryFn: async () => (await api.get<OnboardingLink[]>(`${ADM}/links`)).data,
  });
}

export function useCreateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpsertLinkRequest) =>
      (await api.post<OnboardingLink>(`${ADM}/links`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: K.links }),
  });
}

export function useUpdateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpsertLinkRequest }) =>
      (await api.put<OnboardingLink>(`${ADM}/links/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: K.links }),
  });
}

export function useDeleteLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${ADM}/links/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: K.links }),
  });
}

export function useSubmissions(params: {
  status?: string;
  instituteType?: string;
  page?: number;
  size?: number;
}) {
  return useQuery({
    queryKey: [...K.submissions, params],
    queryFn: async () => {
      const { data } = await api.get<Page<Submission>>(`${ADM}/submissions`, {
        params,
      });
      return data;
    },
  });
}

export function useSubmissionCounts() {
  return useQuery({
    queryKey: K.counts,
    queryFn: async () =>
      (await api.get<Record<string, number>>(`${ADM}/submissions/counts`)).data,
  });
}

export function useSubmission(id: string | null) {
  return useQuery({
    queryKey: [...K.submissions, "detail", id],
    enabled: !!id,
    queryFn: async () =>
      (await api.get<Submission>(`${ADM}/submissions/${id}`)).data,
  });
}

export function useUpdateSubmissionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await api.post<Submission>(`${ADM}/submissions/${id}/status`, { status }))
        .data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.submissions });
      qc.invalidateQueries({ queryKey: K.counts });
    },
  });
}

export function useDemoAccounts() {
  return useQuery({
    queryKey: K.demos,
    queryFn: async () => (await api.get<DemoAccount[]>(`${ADM}/demo-accounts`)).data,
  });
}

export function useUpdateDemoAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: UpdateDemoAccountRequest;
    }) => (await api.put<DemoAccount>(`${ADM}/demo-accounts/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: K.demos }),
  });
}

export function useRecipients() {
  return useQuery({
    queryKey: K.recipients,
    queryFn: async () => (await api.get<Recipient[]>(`${ADM}/recipients`)).data,
  });
}

export function useCreateRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { email: string; name?: string; active?: boolean }) =>
      (await api.post<Recipient>(`${ADM}/recipients`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: K.recipients }),
  });
}

export function useDeleteRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${ADM}/recipients/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: K.recipients }),
  });
}
