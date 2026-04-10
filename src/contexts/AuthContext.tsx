import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type { RiderSession } from "../types/domain";
import { sessionStorageApi } from "../lib/storage";

interface AuthContextValue {
  session: RiderSession | null;
  activeOrderId: string | null;
  incomingRequestCount: number;
  setSession: (session: RiderSession | null) => void;
  clearSession: () => void;
  setActiveOrderId: (orderId: string | null) => void;
  setIncomingRequestCount: (count: number) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSessionState] = useState<RiderSession | null>(() =>
    sessionStorageApi.readSession(),
  );
  const [activeOrderId, setActiveOrderIdState] = useState<string | null>(() =>
    sessionStorageApi.readActiveOrderId(),
  );
  const [incomingRequestCount, setIncomingRequestCount] = useState(0);

  useEffect(() => {
    if (session) {
      sessionStorageApi.writeSession(session);
      return;
    }

    sessionStorageApi.clearSession();
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      activeOrderId,
      incomingRequestCount,
      setSession(nextSession) {
        setSessionState(nextSession);
      },
      clearSession() {
        setSessionState(null);
        setActiveOrderIdState(null);
        setIncomingRequestCount(0);
      },
      setActiveOrderId(orderId) {
        setActiveOrderIdState(orderId);
        sessionStorageApi.writeActiveOrderId(orderId);
      },
      setIncomingRequestCount,
    }),
    [activeOrderId, incomingRequestCount, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
