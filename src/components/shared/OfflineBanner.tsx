import { useOfflineStatus } from "../../hooks/useOfflineStatus";

export function OfflineBanner() {
  const isOffline = useOfflineStatus();

  if (!isOffline) {
    return null;
  }

  return <div className="offline-banner">Internet nahi hai. Reconnect karein.</div>;
}
