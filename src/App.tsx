import { Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthGuard } from "@/components/layout/AppLayout";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const InstitutesPage = lazy(() => import("@/pages/InstitutesPage"));
const InstituteDetailPage = lazy(() => import("@/pages/InstituteDetailPage"));
const CreditsPage = lazy(() => import("@/pages/CreditsPage"));
const ActivityPage = lazy(() => import("@/pages/ActivityPage"));
const PulsePage = lazy(() => import("@/pages/PulsePage"));
const PerfPage = lazy(() => import("@/pages/PerfPage"));
const UsagePage = lazy(() => import("@/pages/UsagePage"));
const AiSettingsPage = lazy(() => import("@/pages/AiSettingsPage"));
const CallsPage = lazy(() => import("@/pages/CallsPage"));
const HealthPage = lazy(() => import("@/pages/HealthPage"));
const StatusPage = lazy(() => import("@/pages/StatusPage"));
const StatusAdminPage = lazy(() => import("@/pages/StatusAdminPage"));
const FilesPage = lazy(() => import("@/pages/FilesPage"));
const FileUploadPage = lazy(() => import("@/pages/FileUploadPage"));
const SupportPage = lazy(() => import("@/pages/SupportPage"));
const SupportBoardPage = lazy(() => import("@/pages/SupportBoardPage"));
const SupportSettingsPage = lazy(() => import("@/pages/SupportSettingsPage"));
const VimotionWaitlistPage = lazy(() => import("@/pages/VimotionWaitlistPage"));
const VimotionInviteCodesPage = lazy(() => import("@/pages/VimotionInviteCodesPage"));
const VimotionStatsPage = lazy(() => import("@/pages/VimotionStatsPage"));
const OnboardingFormPage = lazy(() => import("@/pages/OnboardingFormPage"));
const PlanBuilderPage = lazy(() => import("@/pages/PlanBuilderPage"));
const OnboardingAdminPage = lazy(() => import("@/pages/OnboardingAdminPage"));
const BroadcastsPage = lazy(() => import("@/pages/BroadcastsPage"));
const GuidesAdminPage = lazy(() => import("@/pages/GuidesAdminPage"));
const RoadmapAdminPage = lazy(() => import("@/pages/RoadmapAdminPage"));
const AppRegistrationPage = lazy(() => import("@/pages/AppRegistrationPage"));
const AppDetailPage = lazy(() => import("@/pages/AppDetailPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/onboarding/:slug" element={<OnboardingFormPage />} />
        {/* Plan builder: reached from the onboarding form, or opened cold as a public link. */}
        <Route path="/pricing" element={<PlanBuilderPage />} />
        <Route path="/pricing/:slug" element={<PlanBuilderPage />} />
        <Route element={<AuthGuard />}>
          <Route index element={<DashboardPage />} />
          <Route path="institutes" element={<InstitutesPage />} />
          <Route path="institutes/:id" element={<InstituteDetailPage />} />
          <Route path="credits" element={<CreditsPage />} />
          <Route path="pulse" element={<PulsePage />} />
          <Route path="performance" element={<PerfPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="ai-settings" element={<AiSettingsPage />} />
          <Route path="calls" element={<CallsPage />} />
          <Route path="health" element={<HealthPage />} />
          <Route path="admin/status" element={<StatusAdminPage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="files/upload" element={<FileUploadPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="support/board" element={<SupportBoardPage />} />
          <Route path="support/settings" element={<SupportSettingsPage />} />
          <Route path="broadcasts" element={<BroadcastsPage />} />
          <Route path="guides" element={<GuidesAdminPage />} />
          <Route path="roadmap" element={<RoadmapAdminPage />} />
          <Route path="apps" element={<AppRegistrationPage />} />
          <Route path="apps/:id" element={<AppDetailPage />} />
          <Route path="vimotion/waitlist" element={<VimotionWaitlistPage />} />
          <Route path="vimotion/invite-codes" element={<VimotionInviteCodesPage />} />
          <Route path="vimotion/stats" element={<VimotionStatsPage />} />
          <Route path="onboarding" element={<OnboardingAdminPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
