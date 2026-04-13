import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  acceptOrder,
  declineOrder,
  getDashboard,
  toggleOnline,
} from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useNow } from "../hooks/useNow";
import {
  fetchPendingRiderJobs,
  fetchRiderLocation,
  getNextRiderLocationRefreshDelay,
  type RiderLocation,
} from "../lib/data";
import { formatCurrency, formatDurationHours, formatISTTime, quoteItemsSummary } from "../lib/format";
import { getGoogleMapsRouteUrl } from "../lib/location";
import { getErrorMessage, isAuthError } from "../lib/errorHandling";
import { StatusBadge } from "../components/shared/StatusBadge";
import { ToggleSwitch } from "../components/shared/ToggleSwitch";
import { EmptyState } from "../components/shared/EmptyState";
import { supabase } from "../lib/supabase";
import type { DashboardData, IncomingRequest, PendingRiderJob } from "../types/domain";

export function DashboardPage() {
  const navigate = useNavigate();
  const now = useNow(1000);
  const { session, clearSession, setActiveOrderId, setIncomingRequestCount } = useAuth();
  const { pushToast } = useToast();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingToggle, setUpdatingToggle] = useState(false);
  const [actioningRequest, setActioningRequest] = useState<string | null>(null);
  const [pendingJobs, setPendingJobs] = useState<PendingRiderJob[]>([]);
  const [loadingPendingJobs, setLoadingPendingJobs] = useState(false);
  const [pendingJobsLoaded, setPendingJobsLoaded] = useState(false);
  const [takingJobId, setTakingJobId] = useState<string | null>(null);
  const [riderLocation, setRiderLocation] = useState<RiderLocation | null>(null);

  useEffect(() => {
    if (!session) {
      return;
    }

    let mounted = true;

    const load = async () => {
      try {
        const nextDashboard = await getDashboard(session);

        if (!mounted) {
          return;
        }

        setDashboard(nextDashboard);
        setActiveOrderId(nextDashboard.activeOrder?.order.id ?? null);
        setIncomingRequestCount(nextDashboard.incomingRequests.length);
      } catch (error) {
        if (isAuthError(error)) {
          clearSession();
          pushToast("error", "Session expire ho gaya, dobara login karein");
          navigate("/login", { replace: true });
          return;
        }

        pushToast("error", getErrorMessage(error));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();
    const poller = window.setInterval(load, 30000);

    const channel = supabase
      ?.channel(`dashboard-order-updates-${session.riderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `rider_id=eq.${session.riderId}`,
        },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      window.clearInterval(poller);
      if (channel && supabase) {
        void supabase.removeChannel(channel);
      }
    };
  }, [
    clearSession,
    navigate,
    pushToast,
    session,
    setActiveOrderId,
    setIncomingRequestCount,
  ]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let mounted = true;
    let timeoutId: number | null = null;

    const loadRiderLocation = async () => {
      try {
        const nextLocation = await fetchRiderLocation(session.riderId);

        if (!mounted) {
          return;
        }

        setRiderLocation(nextLocation);
        const nextDelay = getNextRiderLocationRefreshDelay(nextLocation.locationUpdatedAt);
        timeoutId = window.setTimeout(
          loadRiderLocation,
          nextDelay <= 0 ? 5 * 60 * 1000 : nextDelay,
        );
      } catch {
        if (mounted) {
          timeoutId = window.setTimeout(loadRiderLocation, 5 * 60 * 1000);
        }
      }
    };

    void loadRiderLocation();

    return () => {
      mounted = false;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [session]);

  const incomingRequest = dashboard?.incomingRequests[0] ?? null;
  const greeting = useMemo(() => `Namaste, ${session?.riderName ?? "Rider"} 👋`, [session?.riderName]);

  async function handleToggle(nextValue: boolean) {
    if (!session || !dashboard) {
      return;
    }

    if (!nextValue && dashboard.activeOrder) {
      pushToast("info", "Aapke paas ek active order hai. Pehle use complete karein.");
      return;
    }

    try {
      setUpdatingToggle(true);
      await toggleOnline(session, nextValue);
      setDashboard({ ...dashboard, isOnline: nextValue });
      pushToast("success", nextValue ? "Aap Online Hain ✅" : "Aap Offline Hain");
    } catch (error) {
      if (isAuthError(error)) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }

      pushToast("error", getErrorMessage(error));
    } finally {
      setUpdatingToggle(false);
    }
  }

  async function resolveRequest(
    request: IncomingRequest,
    decision: "accept" | "decline",
    openOrderOnAccept = true,
  ) {
    if (!session) {
      return;
    }

    try {
      setActioningRequest(request.orderId);

      if (decision === "accept") {
        await acceptOrder(session, request.orderId);
        setActiveOrderId(request.orderId);
        pushToast("success", "Request accept kar diya");
        navigate(openOrderOnAccept ? `/order/${request.orderId}` : `/request/${request.orderId}`);
        return;
      }

      await declineOrder(session, request.orderId);
      setDashboard((current) =>
        current
          ? {
              ...current,
              incomingRequests: current.incomingRequests.filter(
                (item) => item.orderId !== request.orderId,
              ),
            }
          : current,
      );
      setIncomingRequestCount(Math.max(0, (dashboard?.incomingRequests.length ?? 1) - 1));
      pushToast("info", "Decline kar diya");
    } catch (error) {
      if (isAuthError(error)) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }

      pushToast("error", getErrorMessage(error));
    } finally {
      setActioningRequest(null);
    }
  }

  async function refreshPendingJobs() {
    if (!session) {
      return;
    }

    try {
      setLoadingPendingJobs(true);
      setPendingJobsLoaded(true);
      const location = riderLocation ?? await fetchRiderLocation(session.riderId);
      setRiderLocation(location);

      const jobs = await fetchPendingRiderJobs(session.riderId, location);
      setPendingJobs(jobs);

      if (jobs.length === 0) {
        pushToast("info", "20 km radius mein koi pending rider job nahi mila.");
      }
    } catch (error) {
      pushToast("error", getErrorMessage(error));
    } finally {
      setLoadingPendingJobs(false);
    }
  }

  async function takePendingJob(job: PendingRiderJob) {
    if (!session) {
      return;
    }

    try {
      setTakingJobId(job.id);
      await acceptOrder(session, job.id);
      setActiveOrderId(job.id);
      setPendingJobs((current) => current.filter((item) => item.id !== job.id));
      pushToast("success", "Job le liya");
      navigate(`/order/${job.id}`);
    } catch (error) {
      if (isAuthError(error)) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }

      pushToast("error", getErrorMessage(error));
    } finally {
      setTakingJobId(null);
    }
  }

  function viewPendingJobOnMap(job: PendingRiderJob) {
    const routeUrl = getGoogleMapsRouteUrl(
      job.dealerLat,
      job.dealerLng,
      job.mechanicLat,
      job.mechanicLng,
    );

    if (!routeUrl) {
      pushToast("error", "Map route ke liye location missing hai");
      return;
    }

    window.open(routeUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="page">
      <section className="page__hero">
        <div className="hero-panel stack">
          <div className="row row--top">
            <div>
              <p className="eyebrow">dashboard</p>
              <h1 className="title">{greeting}</h1>
              <p className="subtitle">IST {formatISTTime(now)} · Chrome-ready rider panel</p>
            </div>
            <div className="stack stack--tight" style={{ justifyItems: "end" }}>
              <ToggleSwitch
                checked={dashboard?.isOnline ?? false}
                onChange={handleToggle}
                disabled={updatingToggle}
              />
              <span className={`pill ${(dashboard?.isOnline ?? false) ? "pill--success" : ""}`}>
                {dashboard?.isOnline ? "Aap Online Hain ✅" : "Aap Offline Hain"}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="stack">
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          ) : (
            <>
              {dashboard?.activeOrder ? (
                <div className="card card--solid stack">
                  <div className="card__header">
                    <div>
                      <p className="eyebrow">active job</p>
                      <h2 className="section-title" style={{ fontSize: "1.25rem" }}>
                        {quoteItemsSummary(dashboard.activeOrder.quoteItems)}
                      </h2>
                    </div>
                    <StatusBadge status={dashboard.activeOrder.order.status} />
                  </div>
                  <p className="section-copy">
                    {dashboard.activeOrder.dealer?.shop_name ?? dashboard.activeOrder.dealer?.name ?? "Dealer"}{" "}
                    →{" "}
                    {dashboard.activeOrder.mechanic?.shop_name ??
                      dashboard.activeOrder.mechanic?.name ??
                      "Mechanic"}
                  </p>
                  <div className="detail-list">
                    <div className="detail-row">
                      <dt>Pickup</dt>
                      <dd>{dashboard.activeOrder.dealer?.district ?? "Location pending"}</dd>
                    </div>
                    <div className="detail-row">
                      <dt>Drop</dt>
                      <dd>{dashboard.activeOrder.mechanic?.district ?? "Location pending"}</dd>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => navigate(`/order/${dashboard.activeOrder!.order.id}`)}
                  >
                    Order Dekhein →
                  </button>
                </div>
              ) : null}

              {incomingRequest ? (
                <div className="card card--pulse stack">
                  <div className="card__header">
                    <div>
                      <p className="eyebrow">incoming</p>
                      <h2 className="section-title" style={{ fontSize: "1.15rem" }}>
                        Naya Delivery Request! 🔔
                      </h2>
                    </div>
                    <span className="pill pill--warning">3 min window</span>
                  </div>
                  <p className="section-copy">{quoteItemsSummary(incomingRequest.items)}</p>
                  <div className="detail-list">
                    <div className="detail-row">
                      <dt>Pickup</dt>
                      <dd>
                        {incomingRequest.dealerShopName ?? incomingRequest.dealerName ?? "Dealer"} ·{" "}
                        {incomingRequest.dealerDistrict ?? "—"}
                      </dd>
                    </div>
                    <div className="detail-row">
                      <dt>Drop</dt>
                      <dd>
                        {incomingRequest.mechanicShopName ?? incomingRequest.mechanicName ?? "Mechanic"} ·{" "}
                        {incomingRequest.mechanicDistrict ?? "—"}
                      </dd>
                    </div>
                    <div className="detail-row">
                      <dt>Estimated distance</dt>
                      <dd>{incomingRequest.estimatedDistanceKm?.toFixed(1) ?? "—"} km</dd>
                    </div>
                  </div>
                  <div className="button-row">
                    <button
                      type="button"
                      className="button button--success"
                      onClick={() => resolveRequest(incomingRequest, "accept")}
                      disabled={actioningRequest === incomingRequest.orderId}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() =>
                        navigate(`/request/${incomingRequest.orderId}`, {
                          state: { request: incomingRequest },
                        })
                      }
                    >
                      Details
                    </button>
                  </div>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => resolveRequest(incomingRequest, "decline", false)}
                    disabled={actioningRequest === incomingRequest.orderId}
                  >
                    Decline Karo
                  </button>
                </div>
              ) : !dashboard?.activeOrder ? (
                <EmptyState
                  icon="🛵"
                  title="Koi active order nahi hai"
                  copy="Online rahein aur requests ka intezaar karein."
                />
              ) : null}

              <div className="card stack">
                <div className="card__header">
                  <div>
                    <p className="eyebrow">requests</p>
                    <h2 className="section-title">Nearby pending rider jobs</h2>
                  </div>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={refreshPendingJobs}
                    disabled={loadingPendingJobs}
                  >
                    {loadingPendingJobs ? "Refreshing..." : "Refresh Requests"}
                  </button>
                </div>
                <p className="section-copy">
                  Matching orders: status pending_rider, same district, and dealer pickup within 20 km of your current rider location.
                </p>

                {loadingPendingJobs ? (
                  <div className="stack">
                    <div className="skeleton" />
                    <div className="skeleton" />
                  </div>
                ) : pendingJobs.length > 0 ? (
                  <div className="stack">
                    {pendingJobs.map((job) => (
                      <article className="list-item request-job-card stack" key={job.id}>
                        <div className="card__header">
                          <div>
                            <p className="eyebrow">{job.district}</p>
                            <h3 className="section-title" style={{ fontSize: "1rem" }}>
                              {job.routeDistanceKm.toFixed(1)} km route
                            </h3>
                          </div>
                          <span className="pill pill--success">{formatCurrency(job.earnings)}</span>
                        </div>

                        <div className="detail-list">
                          <div className="detail-row">
                            <dt>Pickup address</dt>
                            <dd>{job.pickAddress}</dd>
                          </div>
                          <div className="detail-row">
                            <dt>Drop address</dt>
                            <dd>{job.dropAddress}</dd>
                          </div>
                          <div className="detail-row">
                            <dt>Rider to dealer</dt>
                            <dd>{job.riderToDealerDistanceKm.toFixed(1)} km away</dd>
                          </div>
                          <div className="detail-row">
                            <dt>Earnings</dt>
                            <dd>Rs 3.0 x {job.routeDistanceKm.toFixed(1)} km = {formatCurrency(job.earnings)}</dd>
                          </div>
                        </div>

                        <div className="button-row">
                          <button
                            type="button"
                            className="button button--success"
                            onClick={() => takePendingJob(job)}
                            disabled={takingJobId === job.id}
                          >
                            {takingJobId === job.id ? "Taking..." : "Take Job"}
                          </button>
                          <button
                            type="button"
                            className="button button--secondary"
                            onClick={() => viewPendingJobOnMap(job)}
                          >
                            View on Map
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : pendingJobsLoaded ? (
                  <EmptyState
                    icon="📍"
                    title="Matching request nahi mila"
                    copy="Same district aur 20 km dealer radius mein pending_rider order nahi hai."
                  />
                ) : (
                  <EmptyState
                    icon="🔄"
                    title="Requests refresh karein"
                    copy="Nearby pending_rider orders DB se fetch karne ke liye Refresh Requests dabayein."
                  />
                )}
              </div>

              <div className="card stack">
                <div className="card__header">
                  <div>
                    <p className="eyebrow">today</p>
                    <h2 className="section-title">Aaj ka snapshot</h2>
                  </div>
                </div>
                <div className="stat-grid">
                  <div className="stat">
                    <div className="stat__label">Deliveries today</div>
                    <div className="stat__value">{dashboard?.stats.deliveriesToday ?? 0}</div>
                  </div>
                  <div className="stat">
                    <div className="stat__label">Earnings today</div>
                    <div className="stat__value">
                      {formatCurrency(dashboard?.stats.earningsToday ?? 0)}
                    </div>
                  </div>
                  <div className="stat" style={{ gridColumn: "1 / -1" }}>
                    <div className="stat__label">Online hours</div>
                    <div className="stat__value">
                      {formatDurationHours(dashboard?.stats.onlineHours ?? 0)}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
