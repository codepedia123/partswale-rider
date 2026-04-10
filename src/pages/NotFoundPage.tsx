import { Link } from "react-router-dom";
import { EmptyState } from "../components/shared/EmptyState";

export function NotFoundPage() {
  return (
    <div className="app-root">
      <main className="page">
        <div className="hero-panel stack">
          <EmptyState icon="🧭" title="Page nahi mili" copy="Route check karke dobara try karein." />
          <Link className="button button--primary" to="/dashboard">
            Dashboard pe wapas jao
          </Link>
        </div>
      </main>
    </div>
  );
}
