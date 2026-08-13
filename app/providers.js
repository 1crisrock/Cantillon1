'use client';

// Client-only context wrapper.
// The QueryClient MUST be created inside the component (via useState) rather
// than at module scope. In the Next.js App Router the module is also evaluated
// during SSR, and a shared module-level client leaves client-side query
// observers unsubscribed after hydration -> useQuery stays isPending forever
// even though the fetch resolves. useState gives one stable client per mount.

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function Providers({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
