import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks/server";

// MSW node server: intercept ALL fetches in unit/component tests so no test touches the
// real backend (E2/T2.7 — relative fetch resolved to the docker container and 401'd).
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
