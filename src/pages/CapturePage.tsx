import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { confirmPhoto } from "../lib/api";
import { captureVideoFrame, compressImageBlob } from "../lib/camera";
import { fetchRiderCoordinates } from "../lib/data";
import { createCaptureTimestamp, uploadOrderPhoto } from "../lib/photoUpload";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { FullscreenLoader } from "../components/shared/FullscreenLoader";
import { PageHeader } from "../components/shared/PageHeader";
import { getErrorMessage, isAuthError } from "../lib/errorHandling";
import { shortOrderId } from "../lib/format";

type CaptureType = "pickup" | "delivery";

interface PreviewState {
  blob: Blob;
  objectUrl: string;
  capturedAt: string;
  lat: number;
  lng: number;
}

async function getPhotoCoordinates(riderId?: string) {
  if (!riderId) {
    throw new Error("Rider session missing");
  }

  return fetchRiderCoordinates(riderId);
}

export function CapturePage() {
  const navigate = useNavigate();
  const { orderId = "", type } = useParams();
  const captureType = (type === "delivery" ? "delivery" : "pickup") as CaptureType;
  const { session, clearSession } = useAuth();
  const { pushToast } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setCameraReady(true);
      } catch {
        setCameraError("Camera permission do Settings mein");
      }
    };

    void startCamera();

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (preview?.objectUrl) {
        URL.revokeObjectURL(preview.objectUrl);
      }
    };
  }, [preview?.objectUrl]);

  const metaLines = useMemo(() => {
    if (!preview) {
      return [];
    }

    return [
      `📍 ${preview.lat.toFixed(4)}, ${preview.lng.toFixed(4)}`,
      `🕐 ${new Date(preview.capturedAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      })}`,
      `📦 ${shortOrderId(orderId)}`,
    ];
  }, [orderId, preview]);

  async function handleCapture() {
    if (!videoRef.current) {
      return;
    }

    try {
      setLocating(true);
      const rawBlob = await captureVideoFrame(videoRef.current);
      const compressedBlob = await compressImageBlob(rawBlob);
      const coords = await getPhotoCoordinates(session?.riderId);
      const objectUrl = URL.createObjectURL(compressedBlob);

      setPreview({
        blob: compressedBlob,
        objectUrl,
        capturedAt: createCaptureTimestamp(),
        lat: coords.lat,
        lng: coords.lng,
      });
      setCameraError("");
    } catch (error) {
      setCameraError(
        error instanceof Error && error.message.includes("Location")
          ? "GPS signal nahi mila. Bahar jaao aur try karo"
          : getErrorMessage(error),
      );
    } finally {
      setLocating(false);
    }
  }

  async function handleSubmit() {
    if (!session || !preview) {
      return;
    }

    try {
      setSubmitting(true);
      const uploadResult = await uploadOrderPhoto(session, orderId, captureType, preview.blob);
      await confirmPhoto(session, {
        order_id: orderId,
        type: captureType,
        image_url: uploadResult.imageUrl,
        lat: preview.lat,
        lng: preview.lng,
        captured_at: preview.capturedAt,
      });
      pushToast("success", "Photo accepted ✅");
      navigate(`/order/${orderId}`, { replace: true });
    } catch (error) {
      if (isAuthError(error)) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }

      pushToast("error", getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-root">
      <main className="camera-shell">
        <PageHeader
          title={captureType === "pickup" ? "Pickup Photo" : "Delivery Photo"}
          subtitle="Photo lena zaroori hai"
          disableBack={submitting}
          onBack={() => {
            if (submitting) {
              return;
            }

            if (window.confirm("Photo lena zaroori hai. Kya aap wapas jaana chahte hain?")) {
              navigate(`/order/${orderId}`);
            }
          }}
        />

        <section className="camera-view">
          {preview ? (
            <>
              <img src={preview.objectUrl} alt="Captured preview" />
              <div className="metadata-overlay">
                {metaLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
            </>
          ) : (
            <>
              <video ref={videoRef} muted playsInline />
              <div className="camera-frame">
                <span>Saare items frame mein rakhein</span>
              </div>
            </>
          )}
        </section>

        <section className="stack">
          {cameraError ? <p className="error-text">{cameraError}</p> : null}
          {!preview ? (
            <>
              <p className="section-copy centered">
                {cameraReady
                  ? "Rear camera ready hai. Shutter dabaiye."
                  : "Camera initialize ho raha hai..."}
              </p>
              <button
                type="button"
                className="button button--primary"
                onClick={handleCapture}
                disabled={!cameraReady || locating}
              >
                {locating ? "Location le rahe hain..." : "Photo Lo"}
              </button>
            </>
          ) : (
            <div className="button-row">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  URL.revokeObjectURL(preview.objectUrl);
                  setPreview(null);
                  setCameraError("");
                }}
                disabled={submitting}
              >
                Retake
              </button>
              <button
                type="button"
                className="button button--success"
                onClick={handleSubmit}
                disabled={submitting}
              >
                Submit
              </button>
            </div>
          )}
        </section>

        {submitting ? (
          <FullscreenLoader title="Photo verify ho rahi hai..." copy="Thodi der rukhiye." />
        ) : null}
      </main>
    </div>
  );
}
