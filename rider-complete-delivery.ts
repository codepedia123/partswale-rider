import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.3";
//test
type JsonBody = { rider_id: string; order_id: string; otp: string };
type ApiOk = { success: true; order_id: string; status: "completed" };
type ApiFail = { success: false; reason: string; message?: string; auth?: false };

type Rider = {
  id: string;
  name: string | null;
  phone: string | null;
  district: string | null;
  vehicle_type?: string | null;
  rating?: number | string | null;
  total_deliveries?: number | string | null;
  completed_deliveries?: number | string | null;
  earnings_total?: number | string | null;
  earnings_pending?: number | string | null;
  conversation?: any;
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

type OrderRow = {
  id: string;
  rider_id: string | null;
  status: string;
  dealer_id: string;
  mechanic_id: string;
  quote_id: string | null;
  amount: number | string | null;
  total_amount: number | string | null;
  delivery_fee: number | string | null;
  platform_fee: number | string | null;
  delivery_photo_id: string | null;
  delivery_otp: string | null;
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

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
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

function formatMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return `₹${Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100}`;
}

function payoutAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100;
}

function appendMessageConversation(row: UserRow | Rider, messageContent: string, role: "user" | "rider") {
  const conv = parseConversation(row.conversation);
  const existingVariables = conv.variables && typeof conv.variables === "object" ? conv.variables : {};
  const messages: any[] = Array.isArray(conv.messages) ? [...conv.messages] : [];

  messages.push({ type: "ai", data: { content: messageContent } });

  return {
    thread_id: conv.thread_id || crypto.randomUUID(),
    variables: role === "rider"
      ? {
          ...existingVariables,
          user_name: row.name ?? existingVariables.user_name ?? "",
          phone: row.phone ?? existingVariables.phone ?? "",
          rider_id: row.id,
          district: row.district ?? existingVariables.district ?? "",
          vehicle_type: (row as Rider).vehicle_type ?? existingVariables.vehicle_type ?? "",
          rating: stringifyConversationValue((row as Rider).rating ?? existingVariables.rating),
          total_deliveries: stringifyConversationValue((row as Rider).total_deliveries ?? existingVariables.total_deliveries),
          completed_deliveries: stringifyConversationValue((row as Rider).completed_deliveries ?? existingVariables.completed_deliveries),
          earnings_total: stringifyConversationValue((row as Rider).earnings_total ?? existingVariables.earnings_total),
          earnings_pending: stringifyConversationValue((row as Rider).earnings_pending ?? existingVariables.earnings_pending),
          context: existingVariables.context ?? {},
        }
      : {
          ...existingVariables,
          user_name: row.name ?? existingVariables.user_name ?? "",
          phone: row.phone ?? existingVariables.phone ?? "",
          user_id: row.id,
          district: row.district ?? existingVariables.district ?? "",
          shop_name: (row as UserRow).shop_name ?? existingVariables.shop_name ?? "",
          category: (row as UserRow).category ?? existingVariables.category ?? "",
          rating: stringifyConversationValue((row as UserRow).rating ?? existingVariables.rating),
          total_orders: stringifyConversationValue((row as UserRow).total_orders ?? existingVariables.total_orders),
          fulfilled_orders: stringifyConversationValue((row as UserRow).fulfilled_orders ?? existingVariables.fulfilled_orders),
          all_ratings: stringifyConversationValue((row as UserRow).all_ratings ?? existingVariables.all_ratings),
          context: existingVariables.context ?? {},
        },
    messages,
  };
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

async function sendWhatsAppReviewList(phone: string, dealerId: string, dealerName: string, orderId: string) {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!accessToken || !phoneNumberId) throw new Error("missing_whatsapp_env");

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "list",
        body: {
          text:
            `Dealer ${dealerName} ko rate karein.\n\n` +
            `Order ID: ${orderId}\nDealer ID: ${dealerId}`,
        },
        action: {
          button: "Rating dein",
          sections: [
            {
              title: "Dealer Rating",
              rows: [
                { id: `dealer_review_${orderId}_${dealerId}_1`, title: "1 ⭐", description: "Poor" },
                { id: `dealer_review_${orderId}_${dealerId}_2`, title: "2 ⭐⭐", description: "Below average" },
                { id: `dealer_review_${orderId}_${dealerId}_3`, title: "3 ⭐⭐⭐", description: "Average" },
                { id: `dealer_review_${orderId}_${dealerId}_4`, title: "4 ⭐⭐⭐⭐", description: "Good" },
                { id: `dealer_review_${orderId}_${dealerId}_5`, title: "5 ⭐⭐⭐⭐⭐", description: "Excellent" },
              ],
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

async function notifyUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  message: string,
  extra?: { reviewDealerId?: string; reviewDealerName?: string; orderId?: string },
) {
  const { data: user, error } = await withTimeout(
    supabase
      .from("users")
      .select("id,name,phone,district,shop_name,category,rating,total_orders,fulfilled_orders,all_ratings,conversation")
      .eq("id", userId)
      .maybeSingle<UserRow>(),
    8000,
  );
  if (error) throw error;
  if (!user) return;

  if (user.phone) {
    if (extra?.reviewDealerId && extra?.reviewDealerName && extra?.orderId) {
      await sendWhatsAppReviewList(user.phone, extra.reviewDealerId, extra.reviewDealerName, extra.orderId);
    } else {
      await sendWhatsAppText(user.phone, message);
    }
  }

  await withTimeout(
    supabase.from("users").update({ conversation: appendMessageConversation(user, message, "user") }).eq("id", user.id),
    8000,
  );
}

async function notifyRider(supabase: ReturnType<typeof createClient>, riderId: string, message: string) {
  const { data: rider, error } = await withTimeout(
    supabase
      .from("riders")
      .select("id,name,phone,district,vehicle_type,rating,total_deliveries,completed_deliveries,earnings_total,earnings_pending,conversation")
      .eq("id", riderId)
      .maybeSingle<Rider>(),
    8000,
  );
  if (error) throw error;
  if (!rider) return;

  if (rider.phone) {
    await sendWhatsAppText(rider.phone, message);
  }

  await withTimeout(
    supabase.from("riders").update({ conversation: appendMessageConversation(rider, message, "rider") }).eq("id", rider.id),
    8000,
  );
}

async function requireAuthRider(supabase: ReturnType<typeof createClient>, req: Request): Promise<{ id: string }> {
  const token = getBearerToken(req);
  if (!token) throw new Error("unauthorized");
  const { data, error } = await supabase.from("riders").select("id").eq("session_token", token).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("unauthorized");
  return data as { id: string };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return jsonResponse({ success: false, reason: "method_not_allowed" }, 405);

    const parsed = safeJsonParse<JsonBody>(await req.text());
    if (!parsed.ok || !parsed.value?.rider_id || !parsed.value?.order_id || !parsed.value?.otp) {
      return jsonResponse({ success: false, reason: "invalid_body", message: "Expected { rider_id, order_id, otp }" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_env");

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const rider = await requireAuthRider(supabase, req);
    if (rider.id !== parsed.value.rider_id) {
      return jsonResponse({ success: false, auth: false, reason: "invalid_session" }, 401);
    }

    const { data: order, error: orderErr } = await withTimeout(
      supabase
        .from("orders")
        .select("id,rider_id,status,dealer_id,mechanic_id,quote_id,amount,total_amount,delivery_fee,platform_fee,delivery_photo_id,delivery_otp")
        .eq("id", parsed.value.order_id)
        .maybeSingle<OrderRow>(),
      8000,
    );
    if (orderErr) throw orderErr;
    if (!order) return jsonResponse({ success: false, reason: "order_not_found" }, 404);
    if (order.rider_id !== rider.id) return jsonResponse({ success: false, reason: "order_mismatch" }, 403);
    if (order.status !== "delivered" || !order.delivery_photo_id) {
      return jsonResponse({ success: false, reason: "invalid_order_state" }, 409);
    }
    if (!order.delivery_otp || String(order.delivery_otp).trim() !== String(parsed.value.otp).trim()) {
      return jsonResponse({ success: false, reason: "invalid_otp", message: "Delivery OTP galat hai" }, 400);
    }

    const completedAt = new Date().toISOString();
    const { data: completedOrder, error: updateErr } = await withTimeout(
      supabase
        .from("orders")
        .update({
          status: "completed",
          mechanic_confirmed_receipt: true,
          delivery_confirmed_at: completedAt,
          delivered_at: completedAt,
        })
        .eq("id", order.id)
        .eq("rider_id", rider.id)
        .eq("status", "delivered")
        .select("id")
        .maybeSingle(),
      8000,
    );
    if (updateErr) throw updateErr;
    if (!completedOrder) return jsonResponse({ success: false, reason: "order_already_updated" }, 409);

    const { error: payoutErr } = await withTimeout(
      supabase.from("payouts").insert([
        {
          order_id: order.id,
          recipient_type: "rider",
          recipient_id: rider.id,
          upi_id: null,
          amount: payoutAmount(order.delivery_fee),
          status: "pending",
        },
        {
          order_id: order.id,
          recipient_type: "dealer",
          recipient_id: order.dealer_id,
          upi_id: null,
          amount: payoutAmount(order.amount ?? order.total_amount),
          status: "pending",
        },
        {
          order_id: order.id,
          recipient_type: "mechanic",
          recipient_id: order.mechanic_id,
          upi_id: null,
          amount: payoutAmount(order.platform_fee),
          status: "pending",
        },
      ]),
      8000,
    );
    if (payoutErr) throw payoutErr;

    const { data: dealer } = await withTimeout(
      supabase
        .from("users")
        .select("id,name,phone,district,shop_name,category,rating,total_orders,fulfilled_orders,all_ratings,conversation")
        .eq("id", order.dealer_id)
        .maybeSingle<UserRow>(),
      8000,
    );

    const riderFee = formatMoney(order.delivery_fee);
    const dealerAmount = formatMoney(order.amount ?? order.total_amount);
    const mechanicDiscountPayout = formatMoney(order.platform_fee);
    const dealerName = dealer?.shop_name || dealer?.name || "Dealer";
    const shortOrderId = order.id.slice(0, 8).toUpperCase();

    const riderMessage =
      `✅ Order completed!\n\n` +
      `Order: ${shortOrderId}\n` +
      `Aapki earning: ${riderFee}\n\n` +
      `Yeh amount aapke pending payout mein add ho gaya hai. Payout Monday settlement cycle mein transfer hoga.`;

    const dealerMessage =
      `✅ Order completed successfully!\n\n` +
      `Order: ${shortOrderId}\n` +
      `Dealer amount: ${dealerAmount}\n\n` +
      `Aapka payout reconciliation ke baad next settlement cycle mein process hoga.`;

    const mechanicMessage =
      `✅ Order completed!\n\n` +
      `Order: ${shortOrderId}\n` +
      `Aapka MRP discount/payout amount ${mechanicDiscountPayout} auto-payout ke liye mark ho gaya hai. Amount jaldi account mein process hoga.`;

    const mechanicReviewMessage =
      `Dealer review dein:\n\n` +
      `1 ⭐\n2 ⭐⭐\n3 ⭐⭐⭐\n4 ⭐⭐⭐⭐\n5 ⭐⭐⭐⭐⭐\n\n` +
      `Dealer: ${dealerName}\nDealer ID: ${order.dealer_id}\nOrder ID: ${order.id}`;

    const results = await Promise.allSettled([
      notifyRider(supabase, rider.id, riderMessage),
      notifyUser(supabase, order.dealer_id, dealerMessage),
      (async () => {
        await notifyUser(supabase, order.mechanic_id, mechanicMessage);
        await notifyUser(supabase, order.mechanic_id, mechanicReviewMessage, {
          reviewDealerId: order.dealer_id,
          reviewDealerName: dealerName,
          orderId: order.id,
        });
      })(),
    ]);

    results.forEach((result) => {
      if (result.status === "rejected") console.error("completion notify failed:", errorMessage(result.reason));
    });

    return jsonResponse({ success: true, order_id: order.id, status: "completed" });
  } catch (err) {
    const msg = errorMessage(err);
    console.error("rider-complete-delivery error:", msg);
    return jsonResponse({ success: false, reason: "server_error", message: msg }, 500);
  }
});
