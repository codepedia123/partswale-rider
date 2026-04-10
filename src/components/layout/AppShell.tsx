import { Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export function AppShell() {
  const location = useLocation();
  const showNav =
    location.pathname.startsWith("/dashboard") ||
    location.pathname.startsWith("/order") ||
    location.pathname.startsWith("/earnings") ||
    location.pathname.startsWith("/profile") ||
    location.pathname === "/";

  return (
    <div className="app-root">
      <Outlet />
      {showNav ? <BottomNav /> : null}
    </div>
  );
}
