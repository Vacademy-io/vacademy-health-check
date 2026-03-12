import { Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthGuard } from "@/components/layout/AppLayout";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const InstitutesPage = lazy(() => import("@/pages/InstitutesPage"));
const InstituteDetailPage = lazy(() => import("@/pages/InstituteDetailPage"));
const CreditsPage = lazy(() => import("@/pages/CreditsPage"));
const ActivityPage = lazy(() => import("@/pages/ActivityPage"));
const UsagePage = lazy(() => import("@/pages/UsagePage"));
const HealthPage = lazy(() => import("@/pages/HealthPage"));
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
        <Route element={<AuthGuard />}>
          <Route index element={<DashboardPage />} />
          <Route path="institutes" element={<InstitutesPage />} />
          <Route path="institutes/:id" element={<InstituteDetailPage />} />
          <Route path="credits" element={<CreditsPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="health" element={<HealthPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
