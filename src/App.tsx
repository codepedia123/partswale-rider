import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { OfflineBanner } from "./components/shared/OfflineBanner";
import { AuthGate } from "./components/shared/AuthGate";
import { ToastViewport } from "./components/shared/ToastViewport";
import { AppShell } from "./components/layout/AppShell";
import { CapturePage } from "./pages/CapturePage";
import { DashboardPage } from "./pages/DashboardPage";
import { EarningsPage } from "./pages/EarningsPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OrderPage } from "./pages/OrderPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RequestPage } from "./pages/RequestPage";

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <OfflineBanner />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/capture/:orderId/:type"
            element={
              <AuthGate>
                <CapturePage />
              </AuthGate>
            }
          />
          <Route
            element={
              <AuthGate>
                <AppShell />
              </AuthGate>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/request/:orderId" element={<RequestPage />} />
            <Route path="/order/:orderId" element={<OrderPage />} />
            <Route path="/earnings" element={<EarningsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <ToastViewport />
      </AuthProvider>
    </ToastProvider>
  );
}
