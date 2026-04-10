import { useEffect, useMemo, useRef, useState } from "react";

export function useCountdown(
  target: string | number | Date | null | undefined,
  onExpire?: () => void,
) {
  const targetMs = target ? new Date(target).getTime() : null;
  const expiredRef = useRef(false);
  const [remainingMs, setRemainingMs] = useState(() =>
    targetMs ? Math.max(0, targetMs - Date.now()) : 0,
  );

  useEffect(() => {
    if (!targetMs) {
      setRemainingMs(0);
      expiredRef.current = false;
      return;
    }

    expiredRef.current = false;

    const tick = () => {
      const next = Math.max(0, targetMs - Date.now());
      setRemainingMs(next);
      if (next === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [onExpire, targetMs]);

  return useMemo(() => {
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return {
      remainingMs,
      totalSeconds,
      isExpired: totalSeconds <= 0,
      label: `${minutes}:${seconds.toString().padStart(2, "0")}`,
    };
  }, [remainingMs]);
}
