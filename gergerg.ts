import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.3";

type JsonBody = {
  rider_id: string;
  order_id: string;
  type: "pickup" | "delivery";
  image_url: string;
  lat: number;
  lng: number;
  captured_at: string;
};

type ApiOk = { success: true; status: string };
type ApiFail = { success: false; reason: string; message?: string };

type Rider = { id: string; session_token?: string | null };

type Order = {
  id: string;
  rider_id: string | null;
  status: string;
  dealer_id: string;
  mechanic_id: string;
  quote_id: string | null;
  delivery_otp: string | null;
  dealer_lat: number | null;
  dealer_lng: number | null;
  mechanic_lat: number | null;
  mechanic_lng: number | null;
};

type UserRow = {
  id: string;
  name: string | null;
  phone: string | null;
  district: string | null;
  shop_name: string | null;
  category: string | null;
  rating: number | string | null;
  total_orders: number | string | null;
  fulfilled_orders: number | string | null;
  all_ratings: any;
  conversation: any;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: ApiOk | ApiFail, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Connection": "keep-alive", ...corsHeaders },
  });
}

function safeJsonParse<T>(text: string): { ok: true; value: T } | { ok: false } {
  try { return { ok: true, value: JSON.parse(text) as T }; }
  catch { return { ok: false }; }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    try { return JSON.stringify(err); }
    catch { return "[unserializable object]"; }
  }
  return String(err);
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function requireAuthRider(supabase: ReturnType<typeof createClient>, req: Request): Promise<Rider> {
  const token = getBearerToken(req);
  if (!token) throw new Error("unauthorized");
  const { data, error } = await supabase.from("riders").select("id,session_token").eq("session_token", token).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("unauthorized");
  return data as Rider;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

function buildItemsSummary(quoteDetails: any[]): string {
  return quoteDetails.map((item: any, i: number) =>
    `${i + 1}. ${item.part_name} (${item.company} ${item.model} ${item.year}) x${item.quantity}`
  ).join("\n");
}

function generateDeliveryOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function parseConversation(conversation: any): any {
  if (typeof conversation !== "string") return conversation || {};
  try { return JSON.parse(conversation); }
  catch { return {}; }
}

function stringifyConversationValue(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try { return JSON.stringify(value); }
    catch { return ""; }
  }
  return String(value);
}

function buildDealerConversation(user: UserRow, messageContent: string): any {
  const conv = parseConversation(user.conversation);
  const existingVariables = conv.variables && typeof conv.variables === "object" ? conv.variables : {};
  const messages: any[] = Array.isArray(conv.messages) ? [...conv.messages] : [];

  messages.push({ type: "ai", data: { content: messageContent } });

  return {
    thread_id: conv.thread_id || crypto.randomUUID(),
    variables: {
      ...existingVariables,
      user_name: user.name ?? existingVariables.user_name ?? "",
      phone: user.phone ?? existingVariables.phone ?? "",
      dealer_id: user.id,
      district: user.district ?? existingVariables.district ?? "",
      shop_name: user.shop_name ?? existingVariables.shop_name ?? "",
      category: user.category ?? existingVariables.category ?? "",
      rating: stringifyConversationValue(user.rating ?? existingVariables.rating),
      total_orders: stringifyConversationValue(user.total_orders ?? existingVariables.total_orders),
      fulfilled_orders: stringifyConversationValue(user.fulfilled_orders ?? existingVariables.fulfilled_orders),
      all_ratings: stringifyConversationValue(user.all_ratings ?? existingVariables.all_ratings),
      context: existingVariables.context ?? {},
    },
    messages,
  };
}

async function sendWhatsAppInteractiveHandoff(params: {
  phone: string;
  orderId: string;
  itemsSummary: string;
}) {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!accessToken || !phoneNumberId) throw new Error("missing_whatsapp_env");

  const orderIdShort = params.orderId.slice(0, 8);
  const bodyText =
    `✅ Rider ne items pickup kar liye!\n\n` +
    `Order: ${orderIdShort}\n` +
    `Items: ${params.itemsSummary || "Items details unavailable"}\n\n` +
    `Kya aapne rider ko sabhi items hand over kar diye?`;

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: params.phone,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: [
            {
              type: "reply",
              reply: {
                id: `confirm_handoff_${params.orderId}`,
                title: "Confirm",
              },
            },
          ],
        },
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`whatsapp_failed: ${res.status} ${txt}`);
  }
}

async function sendWhatsAppText(phone: string, text: string) {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!accessToken || !phoneNumberId) throw new Error("missing_whatsapp_env");

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`whatsapp_failed: ${res.status} ${txt}`);
  }
}

async function fetchItemsSummary(supabase: ReturnType<typeof createClient>, quoteId: string | null): Promise<string> {
  if (!quoteId) return "";
  const { data: quote } = await withTimeout(
    supabase.from("quotes").select("quote_details").eq("id", quoteId).maybeSingle(),
    8000,
  );
  if (!quote?.quote_details) return "";
  let details = quote.quote_details;
  if (typeof details === "string") {
    try { details = JSON.parse(details); } catch { return ""; }
  }
  return Array.isArray(details) ? buildItemsSummary(details) : "";
}

async function notifyAndSaveConversation(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  messageBody: string,
  params?: { orderId: string; itemsSummary: string },
) {
  try {
    const { data: userData, error: userErr } = await withTimeout(
      supabase
        .from("users")
        .select("id,name,phone,district,shop_name,category,rating,total_orders,fulfilled_orders,all_ratings,conversation")
        .eq("id", userId)
        .maybeSingle<UserRow>(),
      8000,
    );
    if (userErr) throw userErr;

    if (userData) {
      const phone = userData.phone;
      if (params) {
        if (phone) {
          await sendWhatsAppInteractiveHandoff({
            phone,
            orderId: params.orderId,
            itemsSummary: params.itemsSummary,
          });
        }
      } else if (phone) {
        await sendWhatsAppText(phone, messageBody);
      }

      const updatedConversation = buildDealerConversation(userData, messageBody);
      await withTimeout(
        supabase.from("users").update({ conversation: updatedConversation }).eq("id", userId),
        8000,
      );
    }
  } catch (err) {
    console.error("notify error:", errorMessage(err));
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return jsonResponse({ success: false, reason: "method_not_allowed" }, 405);

    const parsed = safeJsonParse<JsonBody>(await req.text());
    if (
      !parsed.ok ||
      !parsed.value?.rider_id ||
      !parsed.value?.order_id ||
      !parsed.value?.type ||
      !parsed.value?.image_url ||
      typeof parsed.value?.lat !== "number" ||
      typeof parsed.value?.lng !== "number" ||
      !parsed.value?.captured_at
    ) {
      return jsonResponse({ success: false, reason: "invalid_body", message: "Missing required fields" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_env");

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const rider = await requireAuthRider(supabase, req);
    if (String(rider.id) !== String(parsed.value.rider_id)) {
      return jsonResponse({ success: false, reason: "unauthorized" }, 401);
    }

    const { data: o, error: orderErr } = await withTimeout(
      supabase
        .from("orders")
        .select("id,rider_id,status,dealer_id,mechanic_id,quote_id,delivery_otp,dealer_lat,dealer_lng,mechanic_lat,mechanic_lng")
        .eq("id", parsed.value.order_id)
        .maybeSingle<Order>(),
      8000,
    );
    if (orderErr) throw orderErr;
    if (!o) return jsonResponse({ success: false, reason: "order_not_found" }, 404);
    if (o.rider_id !== rider.id) return jsonResponse({ success: false, reason: "order_mismatch" }, 403);

    const capturedDate = new Date(parsed.value.captured_at);
    if (Number.isNaN(capturedDate.getTime())) return jsonResponse({ success: false, reason: "invalid_captured_at" }, 400);
    const diffMs = Math.abs(Date.now() - capturedDate.getTime());
    if (diffMs > 3 * 60 * 1000) return jsonResponse({ success: false, reason: "captured_at_out_of_window" }, 400);

    const itemsSummary = await fetchItemsSummary(supabase, o.quote_id);
    const fullOrderId = o.id;

    // ── PICKUP PHOTO ──────────────────────────────────────────────────────────
    if (parsed.value.type === "pickup") {
      if (o.status !== "rider_at_pickup") return jsonResponse({ success: false, reason: "invalid_order_state" }, 409);
      if (o.dealer_lat === null || o.dealer_lng === null) return jsonResponse({ success: false, reason: "missing_dealer_coordinates" }, 400);

      const dist = haversineMeters(parsed.value.lat, parsed.value.lng, o.dealer_lat, o.dealer_lng);
      if (dist > 50) return jsonResponse({ success: false, reason: "out_of_geofence", message: `${Math.round(dist)}m from pickup` }, 200);

      const { data: photo, error: photoErr } = await withTimeout(
        supabase.from("photos").insert({
          order_id: o.id,
          rider_id: rider.id,
          type: "pickup",
          image_url: parsed.value.image_url,
          lat: parsed.value.lat,
          lng: parsed.value.lng,
          captured_at: capturedDate.toISOString(),
          validated: true,
        }).select("id").maybeSingle(),
        8000,
      );
      if (photoErr) throw photoErr;
      const photoId = (photo as any)?.id;
      if (!photoId) throw new Error("photo_insert_failed");

      // Only save photo — status stays rider_at_pickup until dealer confirms handoff
      const { error: updErr } = await withTimeout(
        supabase.from("orders").update({ pickup_photo_id: photoId }).eq("id", o.id),
        8000,
      );
      if (updErr) throw updErr;

      // Notify dealer for handoff confirmation
      const dealerMsg =
        `✅ Rider ne items pickup kar liye!\n\n` +
        `Items:\n${itemsSummary}\n\n` +
        `Kya aapne rider ko sabhi items hand over kar diye?\n\n` +
        `Order ID: ${fullOrderId}`;

      await notifyAndSaveConversation(supabase, o.dealer_id, dealerMsg, {
        orderId: fullOrderId,
        itemsSummary,
      });

      return jsonResponse({ success: true, status: "rider_at_pickup" });

    // ── DELIVERY PHOTO ────────────────────────────────────────────────────────
    } else {
      if (o.status !== "rider_at_delivery") return jsonResponse({ success: false, reason: "invalid_order_state" }, 409);
      if (o.mechanic_lat === null || o.mechanic_lng === null) return jsonResponse({ success: false, reason: "missing_mechanic_coordinates" }, 400);

      const dist = haversineMeters(parsed.value.lat, parsed.value.lng, o.mechanic_lat, o.mechanic_lng);
      if (dist > 50) return jsonResponse({ success: false, reason: "out_of_geofence", message: `${Math.round(dist)}m from delivery` }, 200);

      const { data: photo, error: photoErr } = await withTimeout(
        supabase.from("photos").insert({
          order_id: o.id,
          rider_id: rider.id,
          type: "delivery",
          image_url: parsed.value.image_url,
          lat: parsed.value.lat,
          lng: parsed.value.lng,
          captured_at: capturedDate.toISOString(),
          validated: true,
        }).select("id").maybeSingle(),
        8000,
      );
      if (photoErr) throw photoErr;
      const photoId = (photo as any)?.id;
      if (!photoId) throw new Error("photo_insert_failed");

      const deliveryOtp = generateDeliveryOtp();

      const { error: updErr } = await withTimeout(
        supabase.from("orders").update({
          delivery_photo_id: photoId,
          delivery_otp: deliveryOtp,
          status: "delivered",
          auto_confirm_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        }).eq("id", o.id),
        8000,
      );
      if (updErr) throw updErr;

      // Notify mechanic for open-box validation
      const mechanicMsg =
        `Rider have delivered your order.\n\n` +
        `Please give him this OTP once you are confirmed with the items.\n\n` +
        `OTP: ${deliveryOtp}\n\n` +
        `Items:\n${itemsSummary || "Items details unavailable"}\n\n` +
        `Order ID: ${fullOrderId}`;

      await notifyAndSaveConversation(supabase, o.mechanic_id, mechanicMsg);

      return jsonResponse({ success: true, status: "delivered" });
    }

  } catch (err) {
    const msg = errorMessage(err);
    console.error("rider-confirm-photo error:", msg);
    return jsonResponse({ success: false, reason: "server_error", message: msg }, 500);
  }
});
