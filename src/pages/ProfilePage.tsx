import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout, updateAndroidId, updateProfile } from "../lib/api";
import { fetchRiderProfile } from "../lib/data";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { getInitials, maskPhone } from "../lib/format";
import { getErrorMessage, isAuthError } from "../lib/errorHandling";
import { PageHeader } from "../components/shared/PageHeader";
import type { RiderProfile } from "../types/domain";

export function ProfilePage() {
  const navigate = useNavigate();
  const { session, clearSession } = useAuth();
  const { pushToast } = useToast();
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [vehicleType, setVehicleType] = useState("");
  const [district, setDistrict] = useState("");
  const [androidId, setAndroidId] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAndroidId, setSavingAndroidId] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!session) {
      return;
    }

    let mounted = true;

    const load = async () => {
      try {
        const data = await fetchRiderProfile(session.riderId);

        if (!mounted) {
          return;
        }

        setProfile(data);
        setVehicleType(data.vehicle_type ?? "");
        setDistrict(data.district ?? "");
        setAndroidId(data.android_id ?? "");
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

  const completionRate = useMemo(() => {
    if (!profile?.total_deliveries) {
      return 0;
    }

    return Math.round(((profile.completed_deliveries ?? 0) / profile.total_deliveries) * 100);
  }, [profile?.completed_deliveries, profile?.total_deliveries]);

  async function saveProfile() {
    if (!session) {
      return;
    }

    try {
      setSavingProfile(true);
      await updateProfile(session, {
        vehicle_type: vehicleType,
        district,
      });
      setProfile((current) =>
        current
          ? {
              ...current,
              vehicle_type: vehicleType,
              district,
            }
          : current,
      );
      pushToast("success", "Profile changes save ho gaye");
    } catch (error) {
      if (isAuthError(error)) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }

      pushToast("error", getErrorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveAndroidId() {
    if (!session) {
      return;
    }

    try {
      setSavingAndroidId(true);
      await updateAndroidId(session, androidId);
      setProfile((current) =>
        current
          ? {
              ...current,
              android_id: androidId,
            }
          : current,
      );
      pushToast("success", "Android ID update ho gaya");
    } catch (error) {
      if (isAuthError(error)) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }

      pushToast("error", getErrorMessage(error));
    } finally {
      setSavingAndroidId(false);
    }
  }

  async function handleLogout() {
    if (!session) {
      return;
    }

    try {
      setLoggingOut(true);
      await logout(session);
    } catch {
      // Local logout still proceeds.
    } finally {
      clearSession();
      navigate("/login", { replace: true });
      setLoggingOut(false);
    }
  }

  return (
    <main className="page">
      <PageHeader title="Profile" subtitle="Rider details, stats, and settings" />

      <div className="stack">
        {loading ? (
          <>
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </>
        ) : profile ? (
          <>
            <div className="hero-panel stack">
              <div className="row row--top">
                <div className="brand-mark">{getInitials(profile.name)}</div>
                <div style={{ flex: 1 }}>
                  <h1 className="title" style={{ fontSize: "1.6rem" }}>
                    {profile.name}
                  </h1>
                  <p className="subtitle">{maskPhone(profile.phone)}</p>
                  <div className="chip-row" style={{ marginTop: 12 }}>
                    <span className="pill">{profile.district}</span>
                    <span className="pill">{profile.vehicle_type || "Vehicle pending"}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card stack">
              <div className="card__header">
                <div>
                  <p className="eyebrow">rating</p>
                  <h2 className="section-title">Performance</h2>
                </div>
              </div>
              <div className="stat-grid">
                <div className="stat">
                  <div className="stat__label">Rating</div>
                  <div className="stat__value">⭐ {profile.rating?.toFixed(1) ?? "0.0"}/5</div>
                </div>
                <div className="stat">
                  <div className="stat__label">Total deliveries</div>
                  <div className="stat__value">{profile.total_deliveries}</div>
                </div>
                <div className="stat">
                  <div className="stat__label">Completed</div>
                  <div className="stat__value">{profile.completed_deliveries}</div>
                </div>
                <div className="stat">
                  <div className="stat__label">Completion rate</div>
                  <div className="stat__value">{completionRate}%</div>
                </div>
              </div>
            </div>

            <div className="card stack">
              <h2 className="section-title">Device Info</h2>
              <div className="field">
                <label className="label" htmlFor="android-id">
                  Android ID on file
                </label>
                <input
                  id="android-id"
                  className="input"
                  value={androidId}
                  onChange={(event) => setAndroidId(event.target.value)}
                  placeholder="Not set"
                />
              </div>
              <button
                type="button"
                className="button button--secondary"
                onClick={saveAndroidId}
                disabled={savingAndroidId}
              >
                {savingAndroidId ? "Update ho raha hai..." : "Update Android ID"}
              </button>
            </div>

            <div className="card stack">
              <h2 className="section-title">Settings</h2>
              <div className="field">
                <label className="label" htmlFor="vehicle-type">
                  Vehicle Type
                </label>
                <input
                  id="vehicle-type"
                  className="input"
                  value={vehicleType}
                  onChange={(event) => setVehicleType(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="district">
                  District
                </label>
                <input
                  id="district"
                  className="input"
                  value={district}
                  onChange={(event) => setDistrict(event.target.value)}
                />
                <p className="helper-text">District changes admin approval ke baad effective honge.</p>
              </div>
              <button
                type="button"
                className="button button--primary"
                onClick={saveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? "Save ho raha hai..." : "Changes save karein"}
              </button>
            </div>

            <button
              type="button"
              className="button button--danger"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? "Logout ho raha hai..." : "Logout"}
            </button>
          </>
        ) : null}
      </div>
    </main>
  );
}
