"use client";

import Link from "next/link";
import { Component, ErrorInfo, ReactNode } from "react";

type RuntimeGuardProps = {
  children: ReactNode;
};

type RuntimeGuardState = {
  hasError: boolean;
  message: string;
};

export class RuntimeGuard extends Component<RuntimeGuardProps, RuntimeGuardState> {
  state: RuntimeGuardState = {
    hasError: false,
    message: "An unexpected rendering error occurred.",
  };

  static getDerivedStateFromError(error: unknown): RuntimeGuardState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "An unexpected rendering error occurred.",
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("RuntimeGuard caught error:", error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
        <div className="grid-overlay opacity-25" />
        <div className="noise-overlay opacity-60" />
        <section className="glass-surface relative z-10 w-full max-w-lg rounded-[1.5rem] p-6">
          <p className="panel-title">Runtime Recovery</p>
          <h1 className="mt-3 text-2xl leading-tight">The interface recovered from a rendering failure.</h1>
          <p className="mt-3 text-sm text-[color:var(--text-muted)]">{this.state.message}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              onClick={this.handleReload}
              className="rounded-full border border-primary/45 bg-primary/20 px-4 py-2 text-xs font-semibold"
            >
              Reload Safely
            </button>
            <Link href="/" className="rounded-full border border-border/70 bg-panel px-4 py-2 text-xs font-semibold">
              Go to Landing
            </Link>
          </div>
        </section>
      </main>
    );
  }
}
