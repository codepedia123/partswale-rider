export type ToastKind = "success" | "error" | "info";

export type OrderStatus =
  | "new_request"
  | "rider_assigned"
  | "rider_at_pickup"
  | "picked_up"
  | "rider_at_delivery"
  | "delivered"
  | "completed"
  | "cancelled";

export interface RiderSession {
  riderId: string;
  riderName: string;
  token: string;
}

export interface RiderProfile {
  id: string;
  name: string;
  phone: string;
  district: string;
  vehicle_type: string;
  rating: number | null;
  total_deliveries: number;
  completed_deliveries: number;
  earnings_total: number;
  earnings_pending: number;
  android_id: string | null;
  is_online: boolean;
}

export interface UserShop {
  id: string;
  name: string;
  phone?: string | null;
  shop_name?: string | null;
  district?: string | null;
  lat?: number | null;
  lng?: number | null;
  role?: string | null;
}

export interface QuoteItem {
  id?: string;
  part_name?: string;
  name?: string;
  company?: string;
  brand?: string;
  model?: string;
  year?: string | number;
  quantity?: number;
  qty?: number;
  price?: number;
}

export interface OrderRecord {
  id: string;
  rider_id?: string | null;
  request_id?: string | null;
  quote_id?: string | null;
  status: OrderStatus | string;
  order_status?: string | null;
  mechanic_id?: string | null;
  dealer_id?: string | null;
  amount?: number | string | null;
  total_amount?: number | string | null;
  payment_status?: string | null;
  platform_fee?: number | string | null;
  pickup_photo_id?: string | null;
  delivery_photo_id?: string | null;
  pickup_confirmed_at?: string | null;
  delivery_confirmed_at?: string | null;
  dealer_confirmed_handoff?: boolean | null;
  mechanic_confirmed_receipt?: boolean | null;
  auto_confirm_at?: string | null;
  dispute_raised_at?: string | null;
  dealer_lat?: number | null;
  dealer_lng?: number | null;
  mechanic_lat?: number | null;
  mechanic_lng?: number | null;
  distance?: number | string | null;
  pick_address?: string | null;
  drop_address?: string | null;
  district?: string | null;
  dealer_paid_at?: string | null;
  rider_paid_at?: string | null;
  created_at?: string | null;
  delivery_fee?: number | null;
  rider_confirmed_item_count?: boolean | null;
  item_count?: number | null;
}

export interface OrderBundle {
  order: OrderRecord;
  dealer: UserShop | null;
  mechanic: UserShop | null;
  quoteItems: QuoteItem[];
  pooledSequence: string[];
}

export interface DashboardStats {
  deliveriesToday: number;
  earningsToday: number;
  onlineHours: number;
}

export interface DashboardData {
  activeOrder: OrderBundle | null;
  incomingRequests: IncomingRequest[];
  stats: DashboardStats;
  isOnline: boolean;
}

export interface IncomingRequest {
  orderId: string;
  expiresAt?: string | null;
  dealerName?: string | null;
  dealerShopName?: string | null;
  dealerDistrict?: string | null;
  dealerLat?: number | null;
  dealerLng?: number | null;
  mechanicName?: string | null;
  mechanicShopName?: string | null;
  mechanicDistrict?: string | null;
  mechanicLat?: number | null;
  mechanicLng?: number | null;
  estimatedDistanceKm?: number | null;
  deliveryFee?: number | null;
  items: QuoteItem[];
}

export interface DeliveryHistoryItem {
  id: string;
  deliveryConfirmedAt?: string | null;
  riderPaidAt?: string | null;
  quoteDetails: QuoteItem[];
  mechanicDistrict?: string | null;
  dealerName?: string | null;
  deliveryFee?: number | null;
  status: "Paid" | "Pending";
}

export interface EarningsData {
  todayEarnings: number;
  todayCount: number;
  weekEarnings: number;
  weekCount: number;
  pendingPayout: number;
  totalAllTime: number;
  nextMondayDate: string;
  history: DeliveryHistoryItem[];
}

export interface PhotoUploadResult {
  imageUrl: string;
  storagePath: string;
}

export interface ApiEnvelope<T> {
  success?: boolean;
  auth?: boolean;
  reason?: string;
  message?: string;
  data?: T;
  [key: string]: unknown;
}

export interface PendingRiderJob {
  id: string;
  pickAddress: string;
  dropAddress: string;
  dealerLat: number;
  dealerLng: number;
  mechanicLat: number;
  mechanicLng: number;
  routeDistanceKm: number;
  riderToDealerDistanceKm: number;
  earnings: number;
  district: string;
}
