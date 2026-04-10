import { useEffect, useMemo, useRef } from "react";

interface OtpInputProps {
  value: string;
  onChange: (nextValue: string) => void;
}

export function OtpInput({ value, onChange }: OtpInputProps) {
  const digits = useMemo(() => value.padEnd(6, " ").slice(0, 6).split(""), [value]);
  const refs = useRef<HTMLInputElement[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  return (
    <div className="otp-grid">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            if (node) {
              refs.current[index] = node;
            }
          }}
          className="otp-cell"
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit.trim()}
          onChange={(event) => {
            const nextDigit = event.target.value.replace(/\D/g, "").slice(-1);
            const nextValue = value.split("");
            nextValue[index] = nextDigit;
            onChange(nextValue.join("").slice(0, 6));
            if (nextDigit) {
              refs.current[index + 1]?.focus();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !digits[index].trim()) {
              refs.current[index - 1]?.focus();
            }
          }}
        />
      ))}
    </div>
  );
}
