import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

const links = [
  { to: "/dashboard", label: "Home", icon: "🏠" },
  { to: "/order", label: "Active Job", icon: "📦" },
  { to: "/earnings", label: "Earnings", icon: "💰" },
  { to: "/profile", label: "Profile", icon: "👤" },
];

export function BottomNav() {
  const navigate = useNavigate();
  const { activeOrderId, incomingRequestCount } = useAuth();

  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {links.map((link) => {
        if (link.to === "/order") {
          const disabled = !activeOrderId;

          return (
            <button
              key={link.label}
              type="button"
              className={`bottom-nav__link ${disabled ? "bottom-nav__link--disabled" : ""}`}
              onClick={() => {
                if (activeOrderId) {
                  navigate(`/order/${activeOrderId}`);
                }
              }}
              disabled={disabled}
            >
              <span>{link.icon}</span>
              <span>{link.label}</span>
            </button>
          );
        }

        return (
          <NavLink
            key={link.label}
            to={link.to}
            className={({ isActive }) =>
              `bottom-nav__link ${isActive ? "bottom-nav__link--active" : ""}`
            }
          >
            <span>{link.icon}</span>
            <span>{link.label}</span>
            {link.to === "/dashboard" && incomingRequestCount > 0 ? (
              <span className="badge-dot" aria-label={`${incomingRequestCount} new requests`} />
            ) : null}
          </NavLink>
        );
      })}
    </nav>
  );
}
