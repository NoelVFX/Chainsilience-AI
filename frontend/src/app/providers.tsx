"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "@/lib/api";

/** Wraps the app in a React Query client (one per browser session). */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Don't retry network/timeout (status 0) or client 4xx errors —
            // that just doubles the wait before the UI can show a real error.
            // Retry a 5xx once (transient server hiccup).
            retry: (count, error) => {
              const status = error instanceof ApiError ? error.status : undefined;
              if (status === 0 || (status && status >= 400 && status < 500)) return false;
              return count < 1;
            },
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
