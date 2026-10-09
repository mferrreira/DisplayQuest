import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

/** Browser-side MSW worker (service worker at /mockServiceWorker.js). Optional UI mocking. */
export const worker = setupWorker(...handlers);
