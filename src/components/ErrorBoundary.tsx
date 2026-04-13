"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("QuantEdge Error Boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
          <div className="bg-bg-card border border-accent-red/30 rounded-xl p-8 max-w-lg w-full text-center">
            <div className="text-accent-red text-4xl mb-4">⚠️</div>
            <h2 className="font-display font-bold text-text-primary text-xl mb-2">
              Something went wrong
            </h2>
            <p className="text-text-secondary text-sm mb-4">
              QuantEdge hit an unexpected error. Your data is safe — try refreshing.
            </p>
            <pre className="text-xs text-accent-red/80 bg-bg-primary rounded-lg p-3 mb-6 text-left overflow-auto max-h-32 font-mono">
              {this.state.error?.message || "Unknown error"}
            </pre>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-6 py-2 rounded-lg bg-accent-green/20 border border-accent-green/40 text-accent-green font-mono text-sm hover:bg-accent-green/30 transition-all"
            >
              Reload QuantEdge
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
