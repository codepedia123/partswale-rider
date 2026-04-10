import { useEffect, useState } from "react";

export function useOfflineStatus() {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const setOnline = () => setIsOffline(false);
    const setOffline = () => setIsOffline(true);

    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOffline);

    return () => {
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOffline);
    };
  }, []);

  return isOffline;
}
