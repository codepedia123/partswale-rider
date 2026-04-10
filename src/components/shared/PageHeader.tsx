import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  rightSlot?: ReactNode;
  disableBack?: boolean;
  onBack?: () => void;
}

export function PageHeader({
  title,
  subtitle,
  backTo,
  rightSlot,
  disableBack = false,
  onBack,
}: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="top-nav">
      <button
        className="top-nav__action"
        type="button"
        onClick={() => {
          if (onBack) {
            onBack();
            return;
          }

          if (backTo) {
            navigate(backTo);
            return;
          }

          navigate(-1);
        }}
        disabled={disableBack}
        aria-label="Go back"
      >
        ←
      </button>
      <div style={{ flex: 1 }}>
        <h1 className="section-title" style={{ marginBottom: 2 }}>
          {title}
        </h1>
        {subtitle ? <p className="section-copy">{subtitle}</p> : null}
      </div>
      {rightSlot ?? <div style={{ width: 42 }} />}
    </div>
  );
}
