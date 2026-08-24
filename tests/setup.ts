import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// No globals:true in this project — register auto-cleanup explicitly.
afterEach(() => {
  cleanup();
});
