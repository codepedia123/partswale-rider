import type { OrderStatus } from "../../types/domain";

const statusMap: Record<string, { label: string; tone: "success" | "warning" | "danger" | "" }> = {
  rider_assigned: { label: "Assigned", tone: "warning" },
  rider_at_pickup: { label: "At Pickup", tone: "warning" },
  picked_up: { label: "Picked Up", tone: "success" },
  rider_at_delivery: { label: "At Delivery", tone: "warning" },
  delivered: { label: "Delivered", tone: "success" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
  new_request: { label: "New Request", tone: "warning" },
};

export function StatusBadge({ status }: { status: OrderStatus | string }) {
  const descriptor = statusMap[status] ?? { label: status, tone: "" };
  const classes = ["pill"];

  if (descriptor.tone) {
    classes.push(`pill--${descriptor.tone}`);
  }

  return <span className={classes.join(" ")}>{descriptor.label}</span>;
}
