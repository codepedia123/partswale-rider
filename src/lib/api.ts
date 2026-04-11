import { edgeFunctionBase, env, isSupabaseConfigured } from "./env";
import type {
  ApiEnvelope,
  DashboardData,
  IncomingRequest,
  OrderBundle,
  RiderSession,
} from "../types/domain";
import { parseQuoteItems } from "./format";

export class ApiError extends Error {
  status?: number;
  reason?: string;
  auth = false;

  constructor(message: string, options?: { status?: number; reason?: string; auth?: boolean }) {
    super(message);
    this.name = "ApiError";
    this.status = options?.status;
    this.reason = options?.reason;
    this.auth = Boolean(options?.auth);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options?: { token?: string | null; query?: Record<string, string | number | undefined> },
) {
  if (!env.n8nBaseUrl) {
    throw new ApiError("VITE_N8N_BASE_URL is not configure");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  const base = env.n8nBaseUrl.replace(/\/$/, "");
  const url = new URL(`${base}/${path.replace(/^\//, "")}`);

  Object.entries(options?.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  try {
    const response = await fetch(url.toString(), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as ApiEnvelope<T>) : ({} as ApiEnvelope<T>);

    if (payload.auth === false) {
      throw new ApiError("Session expired", {
        status: response.status,
        auth: true,
        reason: payload.reason,
      });
    }

    if (!response.ok || payload.success === false) {
      throw new ApiError(payload.message ?? "Request failed", {
        status: response.status,
        reason: payload.reason,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Request timed out");
    }

    throw new ApiError(error instanceof Error ? error.message : "Network error");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function edgeRequest<T>(
  name: string,
  init: RequestInit = {},
  options?: { token?: string | null; query?: Record<string, string | number | undefined> },
) {
  if (!isSupabaseConfigured || !edgeFunctionBase) {
    throw new ApiError("Supabase edge functions are not configured");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  const functionName = name.replace(/^\/+/, "");
  const url = new URL(`${edgeFunctionBase}/${functionName}`);

  Object.entries(options?.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  try {
    const response = await fetch(url.toString(), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as ApiEnvelope<T>) : ({} as ApiEnvelope<T>);

    if (payload.auth === false || response.status === 401) {
      throw new ApiError("Session expired", {
        status: response.status,
        auth: true,
        reason: payload.reason,
      });
    }

    if (!response.ok || payload.success === false) {
      throw new ApiError(payload.message ?? "Request failed", {
        status: response.status,
        reason: payload.reason,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Request timed out");
    }

    throw new ApiError(error instanceof Error ? error.message : "Network error");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function normalizeActiveOrder(raw: unknown): DashboardData["activeOrder"] {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const dealer = (record.dealer as OrderBundle["dealer"]) ?? null;
  const mechanic = (record.mechanic as OrderBundle["mechanic"]) ?? null;
  const quoteItems = parseQuoteItems(record.quoteItems);
  const pooledSequence = Array.isArray(record.pooledSequence)
    ? (record.pooledSequence as string[])
    : [];

  const {
    dealer: _dealer,
    mechanic: _mechanic,
    quoteItems: _quoteItems,
    pooledSequence: _pooledSequence,
    ...order
  } = record;

  return {
    order: order as unknown as OrderBundle["order"],
    dealer,
    mechanic,
    quoteItems,
    pooledSequence,
  };
}

export function sendOtp(phone: string) {
  return edgeRequest("rider-send-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export function verifyOtp(phone: string, otp: string) {
  return edgeRequest<{ token: string; rider_id: string; name: string }>("rider-verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone, otp }),
  });
}

export function toggleOnline(session: RiderSession, isOnline: boolean) {
  return edgeRequest("rider-toggle-online", {
    method: "POST",
    body: JSON.stringify({ rider_id: session.riderId, is_online: isOnline }),
  }, { token: session.token });
}

export async function getDashboard(session: RiderSession) {
  const payload = await edgeRequest<{
    active_order?: unknown;
    today_stats?: {
      deliveries_today?: number;
      earnings_today?: number;
      online_hours?: number;
    };
    incoming_requests?: IncomingRequest[];
    is_online?: boolean;
  }>("rider-dashboard", { method: "GET" }, {
    token: session.token,
    query: { rider_id: session.riderId },
  });
  const data = (payload.data ?? {}) as {
    active_order?: unknown;
    today_stats?: {
      deliveries_today?: number;
      earnings_today?: number;
      online_hours?: number;
    };
    incoming_requests?: IncomingRequest[];
    is_online?: boolean;
  };
  const topLevel = payload as {
    active_order?: unknown;
    today_stats?: {
      deliveries_today?: number;
      earnings_today?: number;
      online_hours?: number;
    };
    incoming_requests?: IncomingRequest[];
    is_online?: boolean;
  };

  return {
    activeOrder: normalizeActiveOrder(topLevel.active_order ?? data.active_order ?? null),
    incomingRequests: (topLevel.incoming_requests ?? data.incoming_requests ?? []) as IncomingRequest[],
    stats: {
      deliveriesToday: (topLevel.today_stats?.deliveries_today ?? data.today_stats?.deliveries_today ?? 0) as number,
      earningsToday: (topLevel.today_stats?.earnings_today ?? data.today_stats?.earnings_today ?? 0) as number,
      onlineHours: (topLevel.today_stats?.online_hours ?? data.today_stats?.online_hours ?? 0) as number,
    },
    isOnline: Boolean(topLevel.is_online ?? data.is_online),
  } satisfies DashboardData;
}

export function acceptOrder(session: RiderSession, orderId: string) {
  return edgeRequest("rider-accept-order", {
    method: "POST",
    body: JSON.stringify({ rider_id: session.riderId, order_id: orderId }),
  }, { token: session.token });
}

export function declineOrder(session: RiderSession, orderId: string) {
  return edgeRequest("rider-decline-order", {
    method: "POST",
    body: JSON.stringify({ rider_id: session.riderId, order_id: orderId }),
  }, { token: session.token });
}

export function notifyArrivingPickup(session: RiderSession, orderId: string) {
  return edgeRequest("rider-arriving-pickup", {
    method: "POST",
    body: JSON.stringify({ rider_id: session.riderId, order_id: orderId }),
  }, { token: session.token });
}

export function notifyArrivingDelivery(session: RiderSession, orderId: string) {
  return edgeRequest("rider-arriving-delivery", {
    method: "POST",
    body: JSON.stringify({ rider_id: session.riderId, order_id: orderId }),
  }, { token: session.token });
}

export function confirmAtPickup(
  session: RiderSession,
  orderId: string,
  lat: number,
  lng: number,
) {
  return edgeRequest("rider-at-pickup", {
    method: "POST",
    body: JSON.stringify({ rider_id: session.riderId, order_id: orderId, lat, lng }),
  }, { token: session.token });
}

export function confirmAtDelivery(
  session: RiderSession,
  orderId: string,
  lat: number,
  lng: number,
) {
  return request("/rider-at-delivery", {
    method: "POST",
    body: JSON.stringify({ rider_id: session.riderId, order_id: orderId, lat, lng }),
  }, { token: session.token });
}

export function confirmPhoto(
  session: RiderSession,
  payload: {
    order_id: string;
    type: "pickup" | "delivery";
    image_url: string;
    lat: number;
    lng: number;
    captured_at: string;
  },
) {
  return request("/rider-confirm-photo", {
    method: "POST",
    body: JSON.stringify({ rider_id: session.riderId, ...payload }),
  }, { token: session.token });
}

export function raiseIssue(
  session: RiderSession,
  payload: { order_id: string; issue_type: string; note?: string },
) {
  return request("/rider-raise-issue", {
    method: "POST",
    body: JSON.stringify({ rider_id: session.riderId, ...payload }),
  }, { token: session.token });
}

export function updateProfile(
  session: RiderSession,
  payload: { vehicle_type: string; district: string },
) {
  return request("/rider-update-profile", {
    method: "POST",
    body: JSON.stringify({ rider_id: session.riderId, ...payload }),
  }, { token: session.token });
}

export function updateAndroidId(session: RiderSession, androidId: string) {
  return request("/rider-update-android-id", {
    method: "POST",
    body: JSON.stringify({ rider_id: session.riderId, android_id: androidId }),
  }, { token: session.token });
}

export function logout(session: RiderSession) {
  return request("/rider-logout", {
    method: "POST",
    body: JSON.stringify({ rider_id: session.riderId }),
  }, { token: session.token });
}

export async function getSignedPhotoUploadUrl(
  session: RiderSession,
  orderId: string,
  type: "pickup" | "delivery",
  contentType: string,
) {
  try {
    return await request<{
      upload_url?: string;
      signed_url?: string;
      path?: string;
      image_url?: string;
      file_url?: string;
    }>("/rider-photo-upload-url", {
      method: "POST",
      body: JSON.stringify({ rider_id: session.riderId, order_id: orderId, type, content_type: contentType }),
    }, { token: session.token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    return null;
  }
}
