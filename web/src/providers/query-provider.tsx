"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import dynamic from "next/dynamic";

// P3: devtools are dev-only and client-only. ssr:false avoids both the
// production bundle weight and the dual-package context mismatch (a runtime
// require() resolves a second copy of React Query, whose useQueryClient
// then throws "No QueryClient set" during SSR).
const ReactQueryDevtools = dynamic(
  () => import("@tanstack/react-query-devtools").then((m) => m.ReactQueryDevtools),
  { ssr: false },
);

function Devtools() {
  if (process.env.NODE_ENV === "production") return null;
  return <ReactQueryDevtools initialIsOpen={false} />;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Devtools />
    </QueryClientProvider>
  );
}
