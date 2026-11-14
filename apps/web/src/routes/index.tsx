import { Routes, Route } from "react-router";
import { DashboardPage } from "@/pages/DashboardPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { MenuManagementPage } from "@/pages/MenuManagementPage";
import { FloorPlanPage } from "@/pages/FloorPlanPage";
import { TeamManagementPage } from "@/pages/TeamManagementPage";
import { PosPage } from "@/pages/PosPage";
import { KitchenPage } from "@/pages/KitchenPage";
import { AiOperationsPage } from "@/pages/ai-ops/AiOperationsPage";
import { RootLayout } from "@/layouts/RootLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export function AppRouter() {
  return (
    <Routes>
      {/* Public Authentication Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Protected Restaurant OS Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<RootLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/menu" element={<MenuManagementPage />} />
          <Route path="/floor-plan" element={<FloorPlanPage />} />
          <Route path="/team" element={<TeamManagementPage />} />
          <Route path="/pos" element={<PosPage />} />
          <Route path="/kitchen" element={<KitchenPage />} />
          <Route path="/ai-ops" element={<AiOperationsPage />} />
          <Route path="/ai-ops/*" element={<AiOperationsPage />} />
          <Route path="/ai-operations" element={<AiOperationsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
