import type { RiderSession } from "../types/domain";

const SESSION_KEYS = {
  token: "rider_token",
  riderId: "rider_id",
  riderName: "rider_name",
  activeOrderId: "active_order_id",
};

export const sessionStorageApi = {
  readSession(): RiderSession | null {
    const token = sessionStorage.getItem(SESSION_KEYS.token);
    const riderId = sessionStorage.getItem(SESSION_KEYS.riderId);
    const riderName = sessionStorage.getItem(SESSION_KEYS.riderName);

    if (!token || !riderId || !riderName) {
      return null;
    }

    return { token, riderId, riderName };
  },

  writeSession(session: RiderSession) {
    sessionStorage.setItem(SESSION_KEYS.token, session.token);
    sessionStorage.setItem(SESSION_KEYS.riderId, session.riderId);
    sessionStorage.setItem(SESSION_KEYS.riderName, session.riderName);
  },

  clearSession() {
    sessionStorage.removeItem(SESSION_KEYS.token);
    sessionStorage.removeItem(SESSION_KEYS.riderId);
    sessionStorage.removeItem(SESSION_KEYS.riderName);
    sessionStorage.removeItem(SESSION_KEYS.activeOrderId);
  },

  writeActiveOrderId(orderId: string | null) {
    if (!orderId) {
      sessionStorage.removeItem(SESSION_KEYS.activeOrderId);
      return;
    }

    sessionStorage.setItem(SESSION_KEYS.activeOrderId, orderId);
  },

  readActiveOrderId() {
    return sessionStorage.getItem(SESSION_KEYS.activeOrderId);
  },
};
