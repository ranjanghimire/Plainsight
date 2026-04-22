import { Component } from 'react';
import { sendClientErrorReport } from '../telemetry/clientErrorReporter';

/**
 * Catches React render/lifecycle errors, reports sanitized telemetry, and shows a minimal recovery UI.
 */
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    const stack =
      (error && typeof error.stack === 'string' && error.stack) ||
      (info && typeof info.componentStack === 'string'
        ? `componentStack:${info.componentStack}`
        : undefined);
    void sendClientErrorReport({
      type: 'react.error',
      message: error && error.message ? String(error.message) : 'React render error',
      stack,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-6 text-center text-stone-700 dark:text-stone-200">
          <p className="text-sm font-medium">Something went wrong. You can try reloading the app.</p>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-lg bg-stone-800 px-4 py-2 text-sm text-white hover:bg-stone-900 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
