import React from "react";
import ErrorState from "./ErrorState";

/**
 * Contains a render failure to the panel that owns it. `resetKey` lets the
 * parent retry the boundary when fresh data arrives; the fallback's button
 * retries just the subtree without reloading the whole app.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error(error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  retry() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (typeof this.props.fallback === "function") {
      return this.props.fallback({ error: this.state.error, retry: this.retry });
    }
    if (this.props.fallback) return this.props.fallback;

    const fallback = (
      <ErrorState
        title={this.props.title || "This part didn't load"}
        message={
          this.props.message ||
          "Something broke in this section. The rest of the page is still here."
        }
        onRetry={this.retry}
      />
    );

    return this.props.className ? <div className={this.props.className}>{fallback}</div> : fallback;
  }
}
