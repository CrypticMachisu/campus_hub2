import { Link } from "react-router-dom";

// Peer review (00-shared-contracts.md): "Missing Fallback Route" —
// without this, navigating to an unknown path (or a stale bookmark to
// a deleted custom event) rendered a blank white screen instead of
// something a user could recover from.
export default function NotFound() {
  return (
    <div className="container" style={{ paddingTop: "3rem", textAlign: "center" }}>
      <h1>Page not found</h1>
      <p>The page you're looking for doesn't exist or may have been removed.</p>
      <p>
        <Link to="/">Back to Discover</Link>
      </p>
    </div>
  );
}
