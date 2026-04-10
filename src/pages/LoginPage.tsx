import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { sendOtp, verifyOtp } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { OtpInput } from "../components/shared/OtpInput";
import { getErrorMessage } from "../lib/errorHandling";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, setSession } = useAuth();
  const { pushToast } = useToast();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  const normalizedPhone = `91${phone}`;

  async function handleSendOtp() {
    try {
      setLoading(true);
      setError("");
      await sendOtp(normalizedPhone);
      setStage("otp");
      setCooldown(30);
      pushToast("success", "OTP aapke WhatsApp par bheja gaya hai");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    try {
      setLoading(true);
      setError("");
      const response = await verifyOtp(normalizedPhone, otp);
      const token = (response.token ?? response.data?.token) as string | undefined;
      const riderId = (response.rider_id ?? response.data?.rider_id) as string | undefined;
      const name = (response.name ?? response.data?.name) as string | undefined;

      if (!token || !riderId || !name) {
        throw new Error("Login response incomplete hai");
      }

      setSession({
        token,
        riderId,
        riderName: name,
      });

      navigate(location.state?.from ?? "/dashboard", { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-root">
      <main className="page page--bare">
        <section className="page__hero">
          <div className="hero-panel stack">
            <div className="brand-mark">PW</div>
            <div>
              <p className="eyebrow">rider access</p>
              <h1 className="title">Rider Login</h1>
              <p className="subtitle">
                {stage === "phone"
                  ? "Apna WhatsApp number daalo"
                  : "OTP aapke WhatsApp par bheja gaya hai"}
              </p>
            </div>
            <div className="card card--solid stack">
              {stage === "phone" ? (
                <>
                  <div className="field">
                    <label className="label" htmlFor="phone">
                      WhatsApp Number
                    </label>
                    <div className="row">
                      <div className="pill">+91</div>
                      <input
                        id="phone"
                        className="input"
                        inputMode="numeric"
                        placeholder="10 digit number"
                        value={phone}
                        onChange={(event) =>
                          setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))
                        }
                      />
                    </div>
                  </div>
                  {error ? <p className="error-text">{error}</p> : null}
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={phone.length !== 10 || loading}
                    onClick={handleSendOtp}
                  >
                    {loading ? "OTP bhej rahe hain..." : "OTP Bhejo"}
                  </button>
                </>
              ) : (
                <>
                  <div className="stack stack--tight">
                    <OtpInput value={otp} onChange={setOtp} />
                    <p className="helper-text">
                      6-digit OTP daaliye. Phone: +91 {phone}
                    </p>
                  </div>
                  {error ? <p className="error-text">{error}</p> : null}
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={otp.length !== 6 || loading}
                    onClick={handleVerifyOtp}
                  >
                    {loading ? "Verify ho raha hai..." : "Verify Karo"}
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={cooldown > 0 || loading}
                    onClick={handleSendOtp}
                  >
                    {cooldown > 0 ? `Dobara bhejo ${cooldown}s` : "OTP nahi mila? Dobara bhejo"}
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => {
                      setStage("phone");
                      setOtp("");
                      setError("");
                    }}
                  >
                    Number badalna hai
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
