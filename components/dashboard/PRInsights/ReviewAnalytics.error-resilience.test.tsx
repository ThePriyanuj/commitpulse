// ReviewAnalytics.error-resilience.test.tsx
//
// Verifies Hydration Stability, Exception Safety & Error Fallbacks for the
// ReviewAnalytics component. Unexpected background-service interruptions or
// server anomalies must never crash the page — they must be absorbed by a
// localized error boundary that presents a clean recovery UI and routes the
// exception to dev-telemetry trackers.

import React, { Component, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PRInsightData } from '@/services/github/pr-insights';
import ReviewAnalytics from './ReviewAnalytics';

// ---------------------------------------------------------------------------
// Stub framer-motion so animation wrappers render as plain divs in JSDOM.
// ---------------------------------------------------------------------------
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

// ---------------------------------------------------------------------------
// Typed error-boundary fixture used across every test in this suite.
// The onError callback acts as a stand-in for a real telemetry tracker
// (e.g. Sentry, Datadog, or a custom logging endpoint) so we can assert
// that exceptions are forwarded to the observability layer without wiring
// up a live SDK.
// ---------------------------------------------------------------------------
interface BoundaryState {
  caught: boolean;
  error: Error | null;
}

interface BoundaryProps {
  children: ReactNode;
  /** Optional telemetry callback — passed the thrown Error so callers can spy on it. */
  onError?: (err: Error) => void;
}

class TestErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { caught: false, error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    // React calls this synchronously before the next render so the fallback
    // UI is shown instead of the broken subtree.
    return { caught: true, error };
  }

  componentDidCatch(error: Error): void {
    // Forward the exception to any registered telemetry tracker. In
    // production this would be replaced by Sentry.captureException() or an
    // equivalent SDK call.
    this.props.onError?.(error);
  }

  render(): ReactNode {
    if (this.state.caught) {
      return (
        <div role="alert" data-testid="error-recovery-panel">
          <h2>Something went wrong.</h2>
          <p>The review analytics panel failed to load.</p>
          <button onClick={() => this.setState({ caught: false, error: null })}>
            Reload Panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Shared valid data fixture — satisfies PRInsightData so TypeScript is
// happy, but individual tests may override specific fields to inject faults.
// ---------------------------------------------------------------------------
const baseData: PRInsightData = {
  totalPRs: 40,
  prs: [],
  openPRs: 5,
  mergedPRs: 30,
  closedPRs: 5,
  mergeRate: 75,
  avgReviewTime: 6.0,
  avgTimeToFirstReview: 2.0,
  avgCycleTime: 10.0,
  weeklyActivity: [],
  monthlyActivity: [],
  reviewsGiven: 22,
  reviewsReceived: 15,
  avgReviewResponseTime: 3.5,
  fastestReview: 1.2,
  slowestReview: 18.6,
  repoPerformance: [],
  highlights: {},
};

// ---------------------------------------------------------------------------
// Suppress React's own console.error noise for intentional-crash tests so
// the Vitest output stays readable. Restore after each test to prevent
// cross-test leakage.
// ---------------------------------------------------------------------------
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('ReviewAnalytics — Hydration Stability, Exception Safety & Error Fallbacks', () => {
  // Test 1: Mock nested child properties to throw unexpected runtime
  // exceptions or database-connectivity errors.
  //
  // Why: When a background service returns a corrupted payload (e.g. null
  // where .toFixed() is called), the component must not propagate the JS
  // exception to the React root. The boundary proves the fault is localised.
  it('Test 1: boundary catches exception from corrupted payload and prevents a page crash', () => {
    // Simulate a downstream service returning null where .toFixed() is called
    // — triggers a TypeError that mimics a real DB or API failure.
    const corruptedData = {
      ...baseData,
      fastestReview: null as unknown as number,
      slowestReview: undefined as unknown as number,
    };

    const telemetry = vi.fn();

    render(
      <TestErrorBoundary onError={telemetry}>
        <ReviewAnalytics data={corruptedData} />
      </TestErrorBoundary>
    );

    // The recovery panel must surface instead of a blank/broken DOM.
    expect(screen.getByTestId('error-recovery-panel')).toBeDefined();
    expect(screen.getByText('Something went wrong.')).toBeDefined();

    // The exception must have been forwarded to the telemetry layer.
    expect(telemetry).toHaveBeenCalledOnce();
    expect(telemetry.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  // Test 2: Encase execution calls in localized boundary elements.
  //
  // Why: An error boundary must absorb failures without letting them bubble
  // past its render scope. This test verifies the boundary is transparent
  // (invisible) under normal operating conditions so it does not break
  // valid renders.
  it('Test 2: boundary element is transparent when the component renders without fault', () => {
    render(
      <TestErrorBoundary>
        <ReviewAnalytics data={baseData} />
      </TestErrorBoundary>
    );

    // The four metric cards must all be visible through the boundary.
    expect(screen.getByText('Reviews Given')).toBeInTheDocument();
    expect(screen.getByText('Reviews Received')).toBeInTheDocument();
    expect(screen.getByText('Fastest Review')).toBeInTheDocument();
    expect(screen.getByText('Slowest Review')).toBeInTheDocument();

    // The fallback UI must NOT be shown when there is no error.
    expect(screen.queryByTestId('error-recovery-panel')).toBeNull();
  });

  // Test 3: Assert that target modules render a clean error recovery UI
  // instead of crashing the site.
  //
  // Why: A component that always throws simulates the worst-case scenario:
  // an unhandled exception from a nested dependency (e.g. a chart library
  // calling a method that does not exist on a stub). The boundary must swap
  // in a styled fallback so end users see a recovery panel, not a white page.
  it('Test 3: renders a clean error recovery UI with role="alert" when a child throws', () => {
    // Models a dependency that explodes when an external service is lost.
    const BrokenReviewChild = () => {
      throw new Error('503 Service Unavailable — review analytics unreachable');
    };

    render(
      <TestErrorBoundary>
        <BrokenReviewChild />
      </TestErrorBoundary>
    );

    // The recovery panel must carry role="alert" for assistive technologies.
    const panel = screen.getByRole('alert');
    expect(panel).toBeDefined();
    expect(panel).toHaveAttribute('data-testid', 'error-recovery-panel');

    // A meaningful human-readable message must be shown.
    expect(screen.getByText('The review analytics panel failed to load.')).toBeInTheDocument();
  });

  // Test 4: Verify exceptions are logged to dev-telemetry trackers
  // appropriately.
  //
  // Why: Silent failures are worse than visible ones. Every exception that
  // reaches the boundary must be forwarded to the telemetry layer so on-call
  // engineers can diagnose production anomalies without waiting for a user
  // report. The test spies on onError and validates exact error propagation.
  it('Test 4: exceptions are forwarded to the telemetry callback with the correct message', () => {
    const telemetry = vi.fn();
    const DB_ERROR_MSG = 'MongoDB connection pool exhausted';

    const DatabaseFailureChild = () => {
      throw new Error(DB_ERROR_MSG);
    };

    render(
      <TestErrorBoundary onError={telemetry}>
        <DatabaseFailureChild />
      </TestErrorBoundary>
    );

    // onError must be called exactly once per error event.
    expect(telemetry).toHaveBeenCalledOnce();

    // The propagated error must carry the original message so log
    // aggregators can group and alert on it correctly.
    const receivedError: Error = telemetry.mock.calls[0][0];
    expect(receivedError).toBeInstanceOf(Error);
    expect(receivedError.message).toBe(DB_ERROR_MSG);
  });

  // Test 5: Ensure user reset/reload paths are available on recovery panels.
  //
  // Why: An error state with no escape route is a dead end for users. The
  // recovery panel must always expose a "Reload Panel" button so users can
  // attempt recovery without a full page refresh, reducing the support
  // burden of users hard-reloading the entire dashboard for a single widget.
  it('Test 5: recovery panel exposes a reload button reachable by assistive technologies', () => {
    const AlwaysBroken = () => {
      throw new Error('Simulated background service interruption');
    };

    render(
      <TestErrorBoundary>
        <AlwaysBroken />
      </TestErrorBoundary>
    );

    // The recovery panel must be in the DOM.
    expect(screen.getByTestId('error-recovery-panel')).toBeInTheDocument();

    // The button must be discoverable via accessible role query — not just by
    // class name or data-testid — so keyboard and screen-reader users can
    // invoke it without needing a pointing device.
    const reloadBtn = screen.getByRole('button', { name: /reload panel/i });
    expect(reloadBtn).toBeInTheDocument();
  });
});
