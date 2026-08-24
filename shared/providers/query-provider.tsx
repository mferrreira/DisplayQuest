"use client";

/**
 * QueryProvider — mounted ONCE in client-layout (inside SessionProvider/ThemeProvider,
 * wrapping legacy providers additively). Defaults per spec/state-management.md.
 */
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 3;
        },
        throwOnError: false,
      },
      mutations: {
        retry: 0,
        throwOnError: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // Lazily create per browser session; avoids re-instantiating on HMR.
  const [queryClient] = useState(makeQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
