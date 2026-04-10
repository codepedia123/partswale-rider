import type { QuoteItem } from "../types/domain";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export function formatCurrency(amount?: number | null) {
  return currencyFormatter.format(amount ?? 0);
}

export function formatISTTime(date: Date | string | number) {
  return timeFormatter.format(new Date(date));
}

export function formatISTDate(date: Date | string | number) {
  return dateFormatter.format(new Date(date));
}

export function formatISTDateTime(date?: string | number | null) {
  if (!date) {
    return "—";
  }

  return dateTimeFormatter.format(new Date(date));
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (digits.length <= 4) {
    return digits;
  }

  const visibleTail = digits.slice(-4);
  const masked = `${digits.slice(0, 2)}${"X".repeat(Math.max(digits.length - 6, 0))}${visibleTail}`;
  return masked;
}

export function shortOrderId(orderId: string) {
  return orderId.slice(0, 8).toUpperCase();
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function parseQuoteItems(source: unknown): QuoteItem[] {
  if (Array.isArray(source)) {
    return source as QuoteItem[];
  }

  if (typeof source === "string") {
    return safeJsonParse<QuoteItem[]>(source, []);
  }

  return [];
}

export function quoteItemsSummary(items: QuoteItem[]) {
  if (!items.length) {
    return "Items detail pending";
  }

  return items
    .slice(0, 3)
    .map((item) => item.part_name ?? item.name ?? "Part")
    .join(", ");
}

export function countQuoteItems(items: QuoteItem[]) {
  return items.reduce((sum, item) => sum + (item.quantity ?? item.qty ?? 1), 0);
}

export function formatDurationHours(hours?: number | null) {
  const normalized = hours ?? 0;

  if (normalized === 0) {
    return "0 hr";
  }

  if (normalized < 1) {
    return `${Math.round(normalized * 60)} min`;
  }

  return `${normalized.toFixed(1)} hr`;
}

export function metersToHuman(distance?: number | null) {
  if (distance == null || Number.isNaN(distance)) {
    return "Distance unavailable";
  }

  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(1)} km`;
  }

  return `${Math.round(distance)} meter`;
}

export function formatTimestampForCapture(date = new Date()) {
  return new Date(date).toISOString();
}
