import { useEffect, useMemo, useState } from "react";
import { fetchEarnings } from "../lib/data";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { formatCurrency, formatISTDateTime, quoteItemsSummary } from "../lib/format";
import { getErrorMessage } from "../lib/errorHandling";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
import type { EarningsData } from "../types/domain";

export function EarningsPage() {
  const { session } = useAuth();
  const { pushToast } = useToast();
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    if (!session) {
      return;
    }

    let mounted = true;

    const load = async () => {
      try {
        const nextData = await fetchEarnings(session.riderId, 0, 200);

        if (!mounted) {
          return;
        }

        setData(nextData);
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
  }, [pushToast, session]);

  const visibleHistory = useMemo(
    () => data?.history.slice(0, visibleCount) ?? [],
    [data?.history, visibleCount],
  );

  return (
    <main className="page">
      <PageHeader title="Earnings" subtitle="Payouts, pending amounts, delivery history" />

      <div className="stack">
        {loading ? (
          <>
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat">
                <div className="stat__label">Today</div>
                <div className="stat__value">{formatCurrency(data?.todayEarnings ?? 0)}</div>
                <div className="helper-text">{data?.todayCount ?? 0} deliveries</div>
              </div>
              <div className="stat">
                <div className="stat__label">This Week</div>
                <div className="stat__value">{formatCurrency(data?.weekEarnings ?? 0)}</div>
                <div className="helper-text">{data?.weekCount ?? 0} deliveries</div>
              </div>
              <div className="stat">
                <div className="stat__label">Pending Payout</div>
                <div className="stat__value" style={{ color: "#a15c00" }}>
                  {formatCurrency(data?.pendingPayout ?? 0)}
                </div>
              </div>
              <div className="stat">
                <div className="stat__label">All Time</div>
                <div className="stat__value">{formatCurrency(data?.totalAllTime ?? 0)}</div>
              </div>
            </div>

            <div className="card stack">
              <h2 className="section-title">Payout Info</h2>
              <p className="section-copy">
                Pending amount har Monday ko aapke account mein transfer hota hai.
              </p>
              <span className="pill pill--warning">Next payout date: {data?.nextMondayDate ?? "—"}</span>
            </div>

            <div className="card stack">
              <div className="card__header">
                <div>
                  <p className="eyebrow">history</p>
                  <h2 className="section-title">Delivery History</h2>
                </div>
              </div>

              {visibleHistory.length ? (
                <ul className="list">
                  {visibleHistory.map((item) => (
                    <li key={item.id} className="list-item">
                      <div className="row row--top">
                        <div>
                          <strong>{quoteItemsSummary(item.quoteDetails)}</strong>
                          <p className="section-copy">
                            {item.dealerName ?? "Dealer"} → {item.mechanicDistrict ?? "District pending"}
                          </p>
                          <p className="helper-text">{formatISTDateTime(item.deliveryConfirmedAt)}</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong>{formatCurrency(item.deliveryFee ?? 0)}</strong>
                          <div className={`pill ${item.status === "Paid" ? "pill--success" : "pill--warning"}`}>
                            {item.status}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon="💸" title="History khaali hai" copy="Completed deliveries yahan dikhenge." />
              )}

              {data && visibleCount < data.history.length ? (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setVisibleCount((current) => current + 20)}
                >
                  Load More
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
