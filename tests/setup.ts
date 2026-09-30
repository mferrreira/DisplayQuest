import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks/server";

/**
 * jsdom shims for the Radix primitives used by the UI under test.
 *
 * Radix `Select`/`Dialog`/`DropdownMenu` triggers call `hasPointerCapture`
 * (Pointer Capture API), `scrollIntoView` and observe resize via
 * `ResizeObserver` — none of which exist in jsdom. Without these shims the
 * Select does not open SILENTLY (an unhandled exception inside an effect,
 * `aria-expanded` stays false) and the test only fails later when it looks for
 * the `role="option"` nodes. Keep them (AGENTS.md gotcha, 2026-09-03).
 *
 * Guarded by `typeof Element !== "undefined"` so the `// @vitest-environment
 * node` suites (integration roundtrip) skip this block entirely.
 */
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverShim {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverShim;
}

// MSW node server: intercept ALL fetches in unit/component tests so no test touches the
// real backend (E2/T2.7 — relative fetch resolved to the docker container and 401'd).
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
