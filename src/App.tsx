import { useEffect, useState } from "react";
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
import { useAuth } from "./contexts/AuthContext";
import { registerRiderPush, syncRiderNotificationState } from "./lib/api";
import { ensureRiderOneSignalUser, getOneSignalPermissionState, logoutRiderOneSignal, promptRiderOneSignal } from "./lib/onesignal";
import type { RiderSession } from "./types/domain";

async function setupRiderPush(session: RiderSession) {
  const result = await ensureRiderOneSignalUser({
    externalId: session.riderId,
    syncState: async (state) => {
      await syncRiderNotificationState(session, state);
    },
  });
  return Boolean(result.state?.opted_in) && result.state?.permission === "granted";
}

function PushBootstrap() {
  const { session, sessionReady } = useAuth();
  const [needsEnable, setNeedsEnable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sessionReady) return;
    if (!session) return;

    void (async () => {
      const permission = await getOneSignalPermissionState();
      if (permission === "default") {
        setNeedsEnable(true);
        return;
      }
      if (permission === "granted") {
        try {
          await setupRiderPush(session);
          setNeedsEnable(false);
        } catch {
          setNeedsEnable(true);
        }
      } else {
        setNeedsEnable(true);
      }
    })();
  }, [session, sessionReady]);

  useEffect(() => {
    if (!sessionReady || session) return;
    void logoutRiderOneSignal();
  }, [session, sessionReady]);

  if (!session || !needsEnable) return null;

  return (
    <div className="push-blocker">
      <div className="push-blocker__card">
        <p className="eyebrow">Notifications Required</p>
        <h2 className="section-title">Notifications enable kijiye</h2>
        <p className="section-copy">
          Rider jobs aur order updates continue karne ke liye notifications zaroori hain.
        </p>
        <button
          type="button"
          className="button button--primary"
          disabled={busy}
          onClick={async () => {
            try {
              setBusy(true);
              const result = await promptRiderOneSignal({
                externalId: session.riderId,
                syncState: async (state) => {
                  await registerRiderPush(session, state);
                },
              });
              const ok = Boolean(result.state?.opted_in) && result.state?.permission === "granted";
              setNeedsEnable(!ok);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Enable ho raha hai..." : "Enable Notifications"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <OfflineBanner />
        <PushBootstrap />
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
