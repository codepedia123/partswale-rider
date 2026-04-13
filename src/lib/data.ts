import type {
  DeliveryHistoryItem,
  EarningsData,
  OrderBundle,
  OrderRecord,
  PendingRiderJob,
  QuoteItem,
  RiderProfile,
  UserShop,
} from "../types/domain";
import { formatISTDate } from "./format";
import { parseQuoteItems } from "./format";
import { distanceBetweenKm, roundKm, type Coordinates } from "./location";
import { supabase } from "./supabase";

const RIDER_LOCATION_REFRESH_MS = 5 * 60 * 1000;

export interface RiderLocation extends Coordinates {
  locationUpdatedAt: string | null;
}

function ensureSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  return supabase;
}

async function fetchSingleUser(id?: string | null) {
  if (!id) {
    return null;
  }

  const client = ensureSupabase();
  const { data, error } = await client.from("users").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchQuoteDetails(quoteId?: string | null) {
  if (!quoteId) {
    return [];
  }

  const client = ensureSupabase();
  const { data, error } = await client
    .from("quotes")
    .select("quote_details")
    .eq("id", quoteId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return parseQuoteItems(data?.quote_details);
}

async function fetchPooledSequence(riderId?: string | null) {
  if (!riderId) {
    return [];
  }

  const client = ensureSupabase();
  const { data, error } = await client
    .from("rider_active_jobs")
    .select("sequence")
    .eq("rider_id", riderId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return [];
  }

  if (Array.isArray(data?.sequence)) {
    return data.sequence;
  }

  return parseQuoteItems(data?.sequence).map((item) => item.id ?? "");
}

export async function fetchOrderBundle(orderId: string): Promise<OrderBundle> {
  const client = ensureSupabase();
  const { data: order, error } = await client.from("orders").select("*").eq("id", orderId).maybeSingle();

  if (error || !order) {
    throw error ?? new Error("Order not found");
  }

  const [dealer, mechanic, quoteItems, pooledSequence] = await Promise.all([
    fetchSingleUser(order.dealer_id),
    fetchSingleUser(order.mechanic_id),
    fetchQuoteDetails(order.quote_id),
    fetchPooledSequence(order.rider_id),
  ]);

  return {
    order,
    dealer,
    mechanic,
    quoteItems,
    pooledSequence,
  };
}

export async function completeDeliveryWithOtp(riderId: string, orderId: string, otp: string) {
  const client = ensureSupabase();
  const normalizedOtp = otp.trim();

  const { data: order, error } = await client
    .from("orders")
    .select("id,rider_id,status,delivery_photo_id,delivery_otp")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    throw error ?? new Error("Order not found");
  }

  if (order.rider_id !== riderId) {
    throw new Error("Order does not belong to this rider");
  }

  if (order.status !== "delivered" || !order.delivery_photo_id) {
    throw new Error("Delivery photo is not confirmed yet");
  }

  if (!order.delivery_otp || String(order.delivery_otp).trim() !== normalizedOtp) {
    throw new Error("Delivery OTP galat hai");
  }

  const now = new Date().toISOString();
  const { data: completedOrder, error: updateError } = await client
    .from("orders")
    .update({
      status: "completed",
      mechanic_confirmed_receipt: true,
      delivery_confirmed_at: now,
      delivered_at: now,
    })
    .eq("id", orderId)
    .eq("rider_id", riderId)
    .eq("status", "delivered")
    .select("id")
    .maybeSingle();

  if (updateError || !completedOrder) {
    throw updateError ?? new Error("Order could not be completed");
  }
}

export async function fetchRiderProfile(riderId: string): Promise<RiderProfile> {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("riders")
    .select(
      "id, name, phone, district, vehicle_type, rating, total_deliveries, completed_deliveries, earnings_total, earnings_pending, android_id, is_online",
    )
    .eq("id", riderId)
    .maybeSingle();

  if (error || !data) {
    throw error ?? new Error("Profile not found");
  }

  return data;
}

export async function fetchRiderCoordinates(riderId: string): Promise<Coordinates> {
  const location = await fetchRiderLocation(riderId);
  return { lat: location.lat, lng: location.lng };
}

export async function fetchRiderLocation(riderId: string): Promise<RiderLocation> {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("riders")
    .select("lat, lng, location_updated_at")
    .eq("id", riderId)
    .maybeSingle();

  if (error || !data) {
    throw error ?? new Error("Rider location not found");
  }

  const lat = Number(data.lat);
  const lng = Number(data.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error("Rider saved location missing");
  }

  return {
    lat,
    lng,
    locationUpdatedAt: data.location_updated_at ?? null,
  };
}

export function getNextRiderLocationRefreshDelay(locationUpdatedAt?: string | null) {
  if (!locationUpdatedAt) {
    return RIDER_LOCATION_REFRESH_MS;
  }

  const updatedAtMs = new Date(locationUpdatedAt).getTime();
  if (Number.isNaN(updatedAtMs)) {
    return RIDER_LOCATION_REFRESH_MS;
  }

  const elapsedMs = Date.now() - updatedAtMs;
  return Math.max(0, RIDER_LOCATION_REFRESH_MS - elapsedMs);
}

export async function findUserByPhone(phone: string) {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("users")
    .select("id, name, phone, role")
    .eq("phone", phone)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as { id: string; name: string; phone: string; role?: string | null } | null;
}

export async function storeRiderOtp(phone: string, otp: string, expiresAt: string) {
  const client = ensureSupabase();
  const { error } = await client
    .from("riders")
    .update({
      otp,
      otp_expires_at: expiresAt,
    })
    .eq("phone", phone);

  if (error) {
    throw error;
  }
}

function normalizeDistrict(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const districtAliases: Record<string, string> = {
    purnea: "purnia",
    purnia: "purnia",
  };

  return districtAliases[normalized] ?? normalized;
}

function normalizeText(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

export async function fetchPendingRiderJobs(
  riderId: string,
  riderLocation?: Coordinates,
): Promise<PendingRiderJob[]> {
  const client = ensureSupabase();
  const { data: rider, error: riderError } = await client
    .from("riders")
    .select("id, district, lat, lng")
    .eq("id", riderId)
    .maybeSingle();

  if (riderError) {
    throw riderError;
  }

  const riderLat = riderLocation?.lat ?? (rider?.lat == null ? null : Number(rider.lat));
  const riderLng = riderLocation?.lng ?? (rider?.lng == null ? null : Number(rider.lng));
  const riderDistrict = normalizeDistrict(rider?.district);

  if (!riderDistrict || riderLat == null || riderLng == null || Number.isNaN(riderLat) || Number.isNaN(riderLng)) {
    throw new Error("Rider district or current location missing");
  }

  const { data: orders, error: ordersError } = await client
    .from("orders")
    .select(
      "id, status, district, rider_id, dealer_id, mechanic_id, dealer_lat, dealer_lng, mechanic_lat, mechanic_lng, distance, delivery_fee, pick_address, drop_address, created_at",
    )
    .eq("status", "pending_rider")
    .is("rider_id", null)
    .order("created_at", { ascending: false });

  if (ordersError) {
    throw ordersError;
  }

  return ((orders ?? []) as OrderRecord[])
    .filter((order) => normalizeDistrict(order.district) === riderDistrict)
    .map((order) => {
      const dealerLat = Number(order.dealer_lat);
      const dealerLng = Number(order.dealer_lng);
      const mechanicLat = Number(order.mechanic_lat);
      const mechanicLng = Number(order.mechanic_lng);

      if (
        Number.isNaN(dealerLat) ||
        Number.isNaN(dealerLng) ||
        Number.isNaN(mechanicLat) ||
        Number.isNaN(mechanicLng)
      ) {
        return null;
      }

      const riderToDealerDistanceKm = roundKm(
        distanceBetweenKm(
          { lat: riderLat, lng: riderLng },
          { lat: dealerLat, lng: dealerLng },
        ),
      );

      if (riderToDealerDistanceKm > 20) {
        return null;
      }

      const parsedOrderDistance = Number(order.distance);
      const routeDistanceKm = roundKm(
        Number.isFinite(parsedOrderDistance) && parsedOrderDistance > 0
          ? parsedOrderDistance
          : distanceBetweenKm(
              { lat: dealerLat, lng: dealerLng },
              { lat: mechanicLat, lng: mechanicLng },
            ),
      );

      return {
        id: order.id,
        pickAddress: order.pick_address ?? "Pickup address pending",
        dropAddress: order.drop_address ?? "Drop address pending",
        dealerLat,
        dealerLng,
        mechanicLat,
        mechanicLng,
        routeDistanceKm,
        riderToDealerDistanceKm,
        earnings: Math.round(routeDistanceKm * 3.0 * 100) / 100,
        district: order.district ?? rider?.district ?? "",
      } satisfies PendingRiderJob;
    })
    .filter((job): job is PendingRiderJob => Boolean(job))
    .sort((a, b) => a.riderToDealerDistanceKm - b.riderToDealerDistanceKm);
}

export async function fetchEarnings(riderId: string, offset = 0, limit = 20): Promise<EarningsData> {
  const client = ensureSupabase();
  const [riderResult, ordersResult] = await Promise.all([
    client
      .from("riders")
      .select("earnings_pending, earnings_total")
      .eq("id", riderId)
      .maybeSingle(),
    client
      .from("orders")
      .select("*")
      .eq("rider_id", riderId)
      .in("status", ["completed", "delivered"])
      .order("delivery_confirmed_at", { ascending: false })
      .range(offset, offset + limit - 1),
  ]);

  if (riderResult.error) {
    throw riderResult.error;
  }

  if (ordersResult.error) {
    throw ordersResult.error;
  }

  const history = await Promise.all(
    ((ordersResult.data ?? []) as OrderRecord[]).map(async (order) => {
      const [dealer, mechanic, quoteDetails] = await Promise.all([
        fetchSingleUser(order.dealer_id),
        fetchSingleUser(order.mechanic_id),
        fetchQuoteDetails(order.quote_id),
      ]);

      return {
        id: order.id,
        deliveryConfirmedAt: order.delivery_confirmed_at,
        riderPaidAt: order.rider_paid_at,
        quoteDetails,
        mechanicDistrict: mechanic?.district ?? null,
        dealerName: dealer?.shop_name ?? dealer?.name ?? null,
        deliveryFee: order.delivery_fee ?? null,
        status: order.rider_paid_at ? "Paid" : "Pending",
      } satisfies DeliveryHistoryItem;
    }),
  );

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  startOfWeek.setHours(0, 0, 0, 0);

  const todayOrders = history.filter((item) => {
    const date = item.deliveryConfirmedAt ? new Date(item.deliveryConfirmedAt) : null;
    return date ? date >= startOfToday : false;
  });

  const weekOrders = history.filter((item) => {
    const date = item.deliveryConfirmedAt ? new Date(item.deliveryConfirmedAt) : null;
    return date ? date >= startOfWeek : false;
  });

  const nextMonday = new Date(now);
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  nextMonday.setDate(now.getDate() + daysUntilMonday);

  return {
    todayEarnings: todayOrders.reduce((sum, item) => sum + (item.deliveryFee ?? 0), 0),
    todayCount: todayOrders.length,
    weekEarnings: weekOrders.reduce((sum, item) => sum + (item.deliveryFee ?? 0), 0),
    weekCount: weekOrders.length,
    pendingPayout: riderResult.data?.earnings_pending ?? 0,
    totalAllTime: riderResult.data?.earnings_total ?? 0,
    nextMondayDate: formatISTDate(nextMonday),
    history,
  };
}
