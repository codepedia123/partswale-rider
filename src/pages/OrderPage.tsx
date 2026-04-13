import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  confirmAtDelivery,
  confirmAtPickup,
  notifyArrivingDelivery,
  notifyArrivingPickup,
  raiseIssue,
} from "../lib/api";
import { fetchOrderBundle, fetchRiderCoordinates } from "../lib/data";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useGeofenceDistance } from "../hooks/useGeofenceDistance";
import {
  countQuoteItems,
  formatCurrency,
  metersToHuman,
  quoteItemsSummary,
  shortOrderId,
} from "../lib/format";
import { getErrorMessage, isAuthError } from "../lib/errorHandling";
import { openGoogleMaps } from "../lib/location";
import { supabase } from "../lib/supabase";
import { EmptyState } from "../components/shared/EmptyState";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusBadge } from "../components/shared/StatusBadge";
import type { OrderBundle, OrderRecord } from "../types/domain";

function storageFlagKey(orderId: string, name: string) {
  return `order:${orderId}:${name}`;
}

function readFlag(orderId: string, name: string) {
  return sessionStorage.getItem(storageFlagKey(orderId, name)) === "1";
}

function writeFlag(orderId: string, name: string, value: boolean) {
  if (value) {
    sessionStorage.setItem(storageFlagKey(orderId, name), "1");
    return;
  }

  sessionStorage.removeItem(storageFlagKey(orderId, name));
}

export function OrderPage() {
  const navigate = useNavigate();
  const { orderId = "" } = useParams();
  const { session, clearSession, setActiveOrderId } = useAuth();
  const { pushToast } = useToast();
  const [bundle, setBundle] = useState<OrderBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickupAnnounced, setPickupAnnounced] = useState(() => readFlag(orderId, "pickupAnnounced"));
  const [deliveryAnnounced, setDeliveryAnnounced] = useState(() =>
    readFlag(orderId, "deliveryAnnounced"),
  );
  const [riderItemsConfirmed, setRiderItemsConfirmed] = useState(() =>
    readFlag(orderId, "riderItemsConfirmed"),
  );
  const [checkedItems, setCheckedItems] = useState<number[]>([]);
  const [issueNote, setIssueNote] = useState("");
  const [actioning, setActioning] = useState<string | null>(null);

  const order = bundle?.order;
  const dealerTarget =
    order?.dealer_lat != null && order?.dealer_lng != null
      ? { lat: order.dealer_lat, lng: order.dealer_lng }
      : bundle?.dealer?.lat != null && bundle.dealer?.lng != null
        ? { lat: bundle.dealer.lat, lng: bundle.dealer.lng }
        : null;
  const mechanicTarget =
    order?.mechanic_lat != null && order?.mechanic_lng != null
      ? { lat: order.mechanic_lat, lng: order.mechanic_lng }
      : bundle?.mechanic?.lat != null && bundle.mechanic?.lng != null
        ? { lat: bundle.mechanic.lat, lng: bundle.mechanic.lng }
        : null;

  const pickupDistance = useGeofenceDistance(
    dealerTarget,
    order?.status === "rider_assigned",
    session?.riderId,
  );
  const deliveryDistance = useGeofenceDistance(
    mechanicTarget,
    order?.status === "picked_up",
    session?.riderId,
  );

  useEffect(() => {
    if (!orderId) {
      return;
    }

    let mounted = true;

    const load = async () => {
      try {
        const nextBundle = await fetchOrderBundle(orderId);

        if (!mounted) {
          return;
        }

        setBundle(nextBundle);
        setActiveOrderId(nextBundle.order.status === "completed" ? null : orderId);
      } catch (error) {
        pushToast("error", getErrorMessage(error));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    const channel = supabase
      ?.channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const nextOrder = payload.new as OrderRecord;
          if (nextOrder.dealer_confirmed_handoff) {
            pushToast("success", "Dealer confirmation mil gaya");
          }

          void load();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      if (channel && supabase) {
        void supabase.removeChannel(channel);
      }
    };
  }, [orderId, pushToast, setActiveOrderId]);

  useEffect(() => {
    writeFlag(orderId, "pickupAnnounced", pickupAnnounced);
  }, [orderId, pickupAnnounced]);

  useEffect(() => {
    writeFlag(orderId, "deliveryAnnounced", deliveryAnnounced);
  }, [deliveryAnnounced, orderId]);

  useEffect(() => {
    writeFlag(orderId, "riderItemsConfirmed", riderItemsConfirmed);
  }, [orderId, riderItemsConfirmed]);

  useEffect(() => {
    if (bundle?.quoteItems?.length) {
      setCheckedItems((current) =>
        current.length ? current : bundle.quoteItems.map((_, index) => index),
      );
    }
  }, [bundle?.quoteItems]);

  const pickupReadyForPhoto = riderItemsConfirmed;
  const pickupPhotoSubmitted = Boolean(order?.pickup_photo_id);
  const pickupDealerConfirmed = Boolean(order?.dealer_confirmed_handoff);
  const orderComplete = order?.status === "delivered" || order?.status === "completed";
  const disableBack = order?.status === "rider_at_pickup" || order?.status === "rider_at_delivery";

  const steps = useMemo(() => {
    return [
      {
        key: "pickup-route",
        title: "Go to Pickup",
        state:
          order?.status === "rider_assigned"
            ? pickupAnnounced
              ? "done"
              : "active"
            : order
              ? "done"
              : "locked",
      },
      {
        key: "pickup-arrive",
        title: "Arrive at Pickup",
        state:
          order?.status === "rider_assigned"
            ? pickupAnnounced
              ? "active"
              : "locked"
            : order && ["rider_at_pickup", "picked_up", "rider_at_delivery", "delivered", "completed"].includes(order.status)
              ? "done"
              : "locked",
      },
      {
        key: "handoff",
        title: "Confirm Pickup Items",
        state:
          order?.status === "rider_at_pickup"
            ? pickupReadyForPhoto
              ? "done"
              : "active"
            : order && ["picked_up", "rider_at_delivery", "delivered", "completed"].includes(order.status)
              ? "done"
              : "locked",
      },
      {
        key: "pickup-photo",
        title: "Take Pickup Photo",
        state:
          order?.status === "rider_at_pickup"
            ? pickupPhotoSubmitted
              ? "done"
              : pickupReadyForPhoto
                ? "active"
                : "locked"
            : order && ["picked_up", "rider_at_delivery", "delivered", "completed"].includes(order.status)
              ? "done"
              : "locked",
      },
      {
        key: "dealer-confirmation",
        title: "Dealer Confirmation",
        state:
          order?.status === "rider_at_pickup"
            ? pickupPhotoSubmitted
              ? pickupDealerConfirmed
                ? "done"
                : "active"
              : "locked"
            : order && ["picked_up", "rider_at_delivery", "delivered", "completed"].includes(order.status)
              ? "done"
              : "locked",
      },
      {
        key: "delivery-route",
        title: "Go to Delivery",
        state:
          order?.status === "picked_up"
            ? deliveryAnnounced
              ? "done"
              : "active"
            : order && ["rider_at_delivery", "delivered", "completed"].includes(order.status)
              ? "done"
              : "locked",
      },
      {
        key: "delivery-arrive",
        title: "Arrive at Delivery",
        state:
          order?.status === "picked_up"
            ? deliveryAnnounced
              ? "active"
              : "locked"
            : order && ["rider_at_delivery", "delivered", "completed"].includes(order.status)
              ? "done"
              : "locked",
      },
      {
        key: "delivery-photo",
        title: "Take Delivery Photo",
        state:
          order?.status === "rider_at_delivery"
            ? "active"
            : order && ["delivered", "completed"].includes(order.status)
              ? "done"
              : "locked",
      },
      {
        key: "done",
        title: "Done",
        state: orderComplete ? "active" : "locked",
      },
    ];
  }, [
    deliveryAnnounced,
    order,
    orderComplete,
    pickupAnnounced,
    pickupDealerConfirmed,
    pickupPhotoSubmitted,
    pickupReadyForPhoto,
  ]);

  async function runAction(actionKey: string, handler: () => Promise<void>) {
    if (!session) {
      return;
    }

    try {
      setActioning(actionKey);
      await handler();
    } catch (error) {
      if (isAuthError(error)) {
        clearSession();
        pushToast("error", "Session expire ho gaya, dobara login karein");
        navigate("/login", { replace: true });
        return;
      }

      pushToast("error", getErrorMessage(error));
    } finally {
      setActioning(null);
    }
  }

  if (loading) {
    return (
      <main className="page">
        <div className="hero-panel stack">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      </main>
    );
  }

  if (!bundle || !order) {
    return (
      <main className="page">
        <PageHeader title="Active Order" subtitle="Order unavailable" />
        <EmptyState icon="📦" title="No active order" copy="Graceful empty state on /order." />
      </main>
    );
  }

  return (
    <main className="page">
      <PageHeader
        title={`Order ${shortOrderId(order.id)}`}
        subtitle="Active step flow"
        disableBack={disableBack}
        rightSlot={<StatusBadge status={order.status} />}
      />

      <div className="stack">
        <div className="card card--solid stack">
          <div className="row row--top">
            <div>
              <p className="eyebrow">active order</p>
              <h2 className="section-title" style={{ fontSize: "1.2rem" }}>
                {quoteItemsSummary(bundle.quoteItems)}
              </h2>
            </div>
            <span className="pill">{countQuoteItems(bundle.quoteItems)} items</span>
          </div>
          <p className="section-copy">
            {bundle.dealer?.shop_name ?? bundle.dealer?.name ?? "Dealer"} →{" "}
            {bundle.mechanic?.shop_name ?? bundle.mechanic?.name ?? "Mechanic"}
          </p>
        </div>

        <div className="timeline">
          {steps.map((step, index) => (
            <section
              key={step.key}
              className={`timeline-step timeline-step--${step.state === "done" ? "done" : step.state} `}
            >
              <div className="row row--top">
                <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
                  <div className="timeline-step__index">{step.state === "done" ? "✓" : index + 1}</div>
                  <div>
                    <h3 className="section-title">{step.title}</h3>
                    <p className="section-copy">
                      {step.state === "done"
                        ? "Completed"
                        : step.state === "active"
                          ? "Active"
                          : "Locked"}
                    </p>
                  </div>
                </div>
              </div>

              {step.key === "pickup-route" ? (
                <div className="stack">
                  <p className="section-copy">
                    {bundle.dealer?.name ?? "Dealer"} · {bundle.dealer?.shop_name ?? "Shop"} ·{" "}
                    {bundle.dealer?.district ?? "District pending"}
                  </p>
                  <div className="button-row">
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => openGoogleMaps(dealerTarget?.lat, dealerTarget?.lng)}
                    >
                      Directions Kholo
                    </button>
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={step.state !== "active" || actioning === "pickup-route"}
                      onClick={() =>
                        runAction("pickup-route", async () => {
                          await notifyArrivingPickup(session!, order.id);
                          setPickupAnnounced(true);
                          pushToast("success", "Dealer ko notification chali gayi");
                        })
                      }
                    >
                      Main Aa Raha Hoon
                    </button>
                  </div>
                </div>
              ) : null}

              {step.key === "pickup-arrive" ? (
                <div className="stack">
                  <p className="section-copy">
                    {pickupDistance.error ??
                      `Aap dealer se ${metersToHuman(pickupDistance.distance)} door hain`}
                  </p>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={step.state !== "active" || pickupDistance.refreshing}
                    onClick={() => void pickupDistance.refresh()}
                  >
                    {pickupDistance.refreshing ? "Refreshing..." : "Distance Refresh Karo"}
                  </button>
                  <button
                    type="button"
                    className="button button--success"
                    disabled={
                      step.state !== "active" ||
                      !pickupDistance.isWithinFence ||
                      actioning === "pickup-arrive"
                    }
                    onClick={() =>
                      runAction("pickup-arrive", async () => {
                        const coords = pickupDistance.coords ?? await fetchRiderCoordinates(session!.riderId);
                        await confirmAtPickup(session!, order.id, coords.lat, coords.lng);
                        pushToast("success", "Pickup arrival confirm ho gaya");
                        setBundle((current) =>
                          current
                            ? {
                                ...current,
                                order: { ...current.order, status: "rider_at_pickup" },
                              }
                            : current,
                        );
                      })
                    }
                  >
                    Main Pahunch Gaya
                  </button>
                </div>
              ) : null}

              {step.key === "handoff" ? (
                <div className="stack">
                  <p className="section-copy">
                    Dealer se order ID match karein, items lein, aur item count confirm karein.
                  </p>
                  <div className="chip-row">
                    <span className={`pill ${riderItemsConfirmed ? "pill--success" : ""}`}>
                      {riderItemsConfirmed ? "Aapne item count confirm kiya" : "Item count pending"}
                    </span>
                  </div>
                  <ul className="list">
                    {bundle.quoteItems.map((item, index) => {
                      const checked = checkedItems.includes(index);
                      return (
                        <li className="list-item" key={`${item.part_name ?? item.name ?? "item"}-${index}`}>
                          <label className="row" style={{ width: "100%" }}>
                            <span>
                              {item.part_name ?? item.name ?? "Part"} x{item.quantity ?? item.qty ?? 1}
                            </span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                setCheckedItems((current) =>
                                  event.target.checked
                                    ? [...current, index]
                                    : current.filter((value) => value !== index),
                                );
                              }}
                              disabled={riderItemsConfirmed}
                            />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={
                      riderItemsConfirmed ||
                      checkedItems.length !== bundle.quoteItems.length ||
                      step.state === "locked"
                    }
                    onClick={() => {
                      setRiderItemsConfirmed(true);
                      pushToast("success", `Maine ${bundle.quoteItems.length} items le liye hain`);
                    }}
                  >
                    Maine {bundle.quoteItems.length} items le liye hain
                  </button>
                </div>
              ) : null}

              {step.key === "pickup-photo" ? (
                <div className="stack">
                  <p className="section-copy">
                    Saare items clearly dikhne chahiye. Photo abhi dealer ki location par lo.
                  </p>
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={step.state !== "active"}
                    onClick={() => navigate(`/capture/${order.id}/pickup`)}
                  >
                    Camera Kholo
                  </button>
                </div>
              ) : null}

              {step.key === "dealer-confirmation" ? (
                <div className="stack">
                  <p className="section-copy">
                    Pickup photo submit ho gayi. Ab dealer order ID verify karke confirmation karega.
                  </p>
                  <div className="chip-row">
                    <span className={`pill ${pickupDealerConfirmed ? "pill--success" : "pill--warning"}`}>
                      {pickupDealerConfirmed
                        ? "Dealer confirmed"
                        : "Dealer ke confirmation ka wait kar rahe hain..."}
                    </span>
                  </div>
                </div>
              ) : null}

              {step.key === "delivery-route" ? (
                <div className="stack">
                  <p className="section-copy">
                    {bundle.mechanic?.name ?? "Mechanic"} · {bundle.mechanic?.shop_name ?? "Shop"} ·{" "}
                    {bundle.mechanic?.district ?? "District pending"}
                  </p>
                  {bundle.pooledSequence.length > 0 ? (
                    <div className="chip-row">
                      {bundle.pooledSequence.map((sequenceItem, index) => (
                        <span className={`pill ${index === 0 ? "pill--warning" : ""}`} key={sequenceItem || index}>
                          {index === 0 ? "Current" : "Next"} #{index + 1}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="button-row">
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => openGoogleMaps(mechanicTarget?.lat, mechanicTarget?.lng)}
                    >
                      Directions Kholo
                    </button>
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={step.state !== "active" || actioning === "delivery-route"}
                      onClick={() =>
                        runAction("delivery-route", async () => {
                          await notifyArrivingDelivery(session!, order.id);
                          setDeliveryAnnounced(true);
                          pushToast("success", "Mechanic ko notification chali gayi");
                        })
                      }
                    >
                      Delivery pe Ja Raha Hoon
                    </button>
                  </div>
                </div>
              ) : null}

              {step.key === "delivery-arrive" ? (
                <div className="stack">
                  <p className="section-copy">
                    {deliveryDistance.error ??
                      `Aap mechanic se ${metersToHuman(deliveryDistance.distance)} door hain`}
                  </p>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={step.state !== "active" || deliveryDistance.refreshing}
                    onClick={() => void deliveryDistance.refresh()}
                  >
                    {deliveryDistance.refreshing ? "Refreshing..." : "Distance Refresh Karo"}
                  </button>
                  <button
                    type="button"
                    className="button button--success"
                    disabled={
                      step.state !== "active" ||
                      !deliveryDistance.isWithinFence ||
                      actioning === "delivery-arrive"
                    }
                    onClick={() =>
                      runAction("delivery-arrive", async () => {
                        const coords = deliveryDistance.coords ?? await fetchRiderCoordinates(session!.riderId);
                        await confirmAtDelivery(session!, order.id, coords.lat, coords.lng);
                        pushToast("success", "Delivery arrival confirm ho gaya");
                        setBundle((current) =>
                          current
                            ? {
                                ...current,
                                order: { ...current.order, status: "rider_at_delivery" },
                              }
                            : current,
                        );
                      })
                    }
                  >
                    Main Pahunch Gaya
                  </button>
                </div>
              ) : null}

              {step.key === "delivery-photo" ? (
                <div className="stack">
                  <p className="section-copy">
                    Items ki delivery photo lo. Yeh step completion ke liye mandatory hai.
                  </p>
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={step.state !== "active"}
                    onClick={() => navigate(`/capture/${order.id}/delivery`)}
                  >
                    Camera Kholo
                  </button>
                </div>
              ) : null}

              {step.key === "done" && orderComplete ? (
                <div className="stack">
                  <p className="section-title">Delivery complete ho gayi!</p>
                  <p className="section-copy">
                    Earnings earned: {formatCurrency(order.delivery_fee ?? 0)}. Rating 24 hours mein release hogi.
                  </p>
                  <button
                    type="button"
                    className="button button--success"
                    onClick={() => navigate("/dashboard")}
                  >
                    Dashboard pe Jaao
                  </button>
                </div>
              ) : null}
            </section>
          ))}
        </div>

        <div className="card stack">
          <div className="card__header">
            <div>
              <p className="eyebrow">support</p>
              <h2 className="section-title">Koi Problem?</h2>
            </div>
          </div>
          <textarea
            className="textarea"
            placeholder="Issue note likh dein"
            value={issueNote}
            onChange={(event) => setIssueNote(event.target.value)}
          />
          <div className="button-row">
            <button
              type="button"
              className="button button--secondary"
              onClick={() =>
                runAction("issue-order", async () => {
                  await raiseIssue(session!, {
                    order_id: order.id,
                    issue_type: "order_issue",
                    note: issueNote,
                  });
                  setIssueNote("");
                  pushToast("success", "Order issue raise kar diya");
                })
              }
            >
              Order se Related Issue
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() =>
                runAction("issue-location", async () => {
                  await raiseIssue(session!, {
                    order_id: order.id,
                    issue_type: "location_issue",
                    note: issueNote,
                  });
                  setIssueNote("");
                  pushToast("success", "Location issue raise kar diya");
                })
              }
            >
              Location Problem
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
