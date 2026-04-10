import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { acceptOrder, declineOrder } from "../lib/api";
import { fetchOrderBundle } from "../lib/data";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useCountdown } from "../hooks/useCountdown";
import { countQuoteItems, formatCurrency, quoteItemsSummary } from "../lib/format";
import { getErrorMessage, isAuthError } from "../lib/errorHandling";
import { distanceBetweenMeters, openGoogleMaps } from "../lib/location";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
import type { IncomingRequest, OrderBundle } from "../types/domain";

export function RequestPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId = "" } = useParams();
  const { session, clearSession, setActiveOrderId } = useAuth();
  const { pushToast } = useToast();
  const [request, setRequest] = useState<IncomingRequest | null>(
    (location.state as { request?: IncomingRequest } | null)?.request ?? null,
  );
  const [bundle, setBundle] = useState<OrderBundle | null>(null);
  const [loading, setLoading] = useState(!request);
  const [acting, setActing] = useState<"accept" | "decline" | null>(null);

  useEffect(() => {
    if (request || !orderId) {
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
        setRequest({
          orderId,
          expiresAt: nextBundle.order.created_at,
          dealerName: nextBundle.dealer?.name ?? null,
          dealerShopName: nextBundle.dealer?.shop_name ?? null,
          dealerDistrict: nextBundle.dealer?.district ?? null,
          dealerLat: nextBundle.order.dealer_lat ?? nextBundle.dealer?.lat ?? null,
          dealerLng: nextBundle.order.dealer_lng ?? nextBundle.dealer?.lng ?? null,
          mechanicName: nextBundle.mechanic?.name ?? null,
          mechanicShopName: nextBundle.mechanic?.shop_name ?? null,
          mechanicDistrict: nextBundle.mechanic?.district ?? null,
          mechanicLat: nextBundle.order.mechanic_lat ?? nextBundle.mechanic?.lat ?? null,
          mechanicLng: nextBundle.order.mechanic_lng ?? nextBundle.mechanic?.lng ?? null,
          deliveryFee: nextBundle.order.delivery_fee ?? null,
          estimatedDistanceKm: null,
          items: nextBundle.quoteItems,
        });
      } catch (error) {
        pushToast("error", getErrorMessage(error));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [orderId, pushToast, request]);

  const expiresAt = useMemo(() => {
    if (request?.expiresAt) {
      return request.expiresAt;
    }

    if (bundle?.order.created_at) {
      return new Date(new Date(bundle.order.created_at).getTime() + 3 * 60 * 1000).toISOString();
    }

    return new Date(Date.now() + 3 * 60 * 1000).toISOString();
  }, [bundle?.order.created_at, request?.expiresAt]);

  const estimatedDistanceKm = useMemo(() => {
    if (request?.estimatedDistanceKm != null) {
      return request.estimatedDistanceKm;
    }

    if (
      request?.dealerLat == null ||
      request.dealerLng == null ||
      request.mechanicLat == null ||
      request.mechanicLng == null
    ) {
      return null;
    }

    return (
      distanceBetweenMeters(
        { lat: request.dealerLat, lng: request.dealerLng },
        { lat: request.mechanicLat, lng: request.mechanicLng },
      ) / 1000
    );
  }, [
    request?.dealerLat,
    request?.dealerLng,
    request?.estimatedDistanceKm,
    request?.mechanicLat,
    request?.mechanicLng,
  ]);

  const countdown = useCountdown(expiresAt, async () => {
    if (!session || !orderId) {
      return;
    }

    try {
      await declineOrder(session, orderId);
      pushToast("info", "Request expire ho gayi");
      navigate("/dashboard", { replace: true });
    } catch {
      navigate("/dashboard", { replace: true });
    }
  });

  async function handleDecision(decision: "accept" | "decline") {
    if (!session) {
      return;
    }

    try {
      setActing(decision);

      if (decision === "accept") {
        await acceptOrder(session, orderId);
        setActiveOrderId(orderId);
        pushToast("success", "Order accept ho gaya");
        navigate(`/order/${orderId}`, { replace: true });
        return;
      }

      await declineOrder(session, orderId);
      pushToast("info", "Decline kar diya");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      if (isAuthError(error)) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }

      pushToast("error", getErrorMessage(error));
    } finally {
      setActing(null);
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

  if (!request) {
    return (
      <main className="page">
        <PageHeader title="Incoming Request" subtitle="Request data unavailable" />
        <EmptyState icon="⌛" title="Request nahi mila" copy="Yeh request expire ho chuki hai." />
      </main>
    );
  }

  return (
    <main className="page">
      <PageHeader title="Incoming Request" subtitle={`Order ${orderId.slice(0, 8).toUpperCase()}`} />

      <div className="stack">
        <div className="card centered stack">
          <div className="countdown-ring" style={{ ["--progress" as string]: `${(countdown.totalSeconds / 180) * 100}%` }}>
            <div className="countdown-ring__inner">
              <strong>{countdown.label}</strong>
              <span className="helper-text">baaki hai</span>
            </div>
          </div>
          <p className="section-title centered">Request response window</p>
          <p className="section-copy centered">0 hone par request auto-decline ho jayegi.</p>
        </div>

        <div className="card stack">
          <div className="card__header">
            <div>
              <p className="eyebrow">order summary</p>
              <h2 className="section-title">{quoteItemsSummary(request.items)}</h2>
            </div>
            <span className="pill">{countQuoteItems(request.items)} items</span>
          </div>
          <ul className="list">
            {request.items.map((item, index) => (
              <li key={`${item.part_name ?? item.name ?? "item"}-${index}`} className="list-item">
                <div className="row row--top">
                  <div>
                    <strong>{item.part_name ?? item.name ?? "Part item"}</strong>
                    <p className="section-copy">
                      {item.company ?? item.brand ?? "Brand"} · {item.model ?? "Model"} ·{" "}
                      {item.year ?? "Year"} · Qty {item.quantity ?? item.qty ?? 1}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card stack">
          <h2 className="section-title">Route</h2>
          <div className="detail-list">
            <div className="detail-row">
              <dt>Pickup</dt>
              <dd>
                {request.dealerShopName ?? request.dealerName ?? "Dealer"} · {request.dealerDistrict ?? "—"}
              </dd>
            </div>
            <div className="detail-row">
              <dt>Drop</dt>
                      <dd>
                        {request.mechanicShopName ?? request.mechanicName ?? "Mechanic"} ·{" "}
                        {request.mechanicDistrict ?? "—"}
                      </dd>
                    </div>
                    <div className="detail-row">
                      <dt>Estimated distance</dt>
                      <dd>{estimatedDistanceKm?.toFixed(1) ?? "—"} km</dd>
                    </div>
                  </div>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => openGoogleMaps(request.dealerLat, request.dealerLng)}
          >
            Google Maps kholo
          </button>
        </div>

        <div className="card stack">
          <h2 className="section-title">Earnings Preview</h2>
          <p className="title" style={{ fontSize: "1.7rem" }}>
            {formatCurrency(request.deliveryFee ?? bundle?.order.delivery_fee ?? 0)}
          </p>
          <p className="section-copy">Is delivery ke liye aapko itna milega.</p>
        </div>

        <button
          type="button"
          className="button button--success"
          onClick={() => handleDecision("accept")}
          disabled={acting !== null}
        >
          {acting === "accept" ? "Accept ho raha hai..." : "Accept Karo"}
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => handleDecision("decline")}
          disabled={acting !== null}
        >
          {acting === "decline" ? "Decline ho raha hai..." : "Decline Karo"}
        </button>
      </div>
    </main>
  );
}
