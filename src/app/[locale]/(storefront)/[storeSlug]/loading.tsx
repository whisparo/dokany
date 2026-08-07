// app/(storefront)/[storeSlug]/loading.tsx

import { Container } from '@/components/shared/Container';

export default function StoreLoading() {
  return (
    <Container maxWidth="xl" className="py-8">
      {/* Title & Subtitle Skeleton */}
      <div className="mb-8 text-center space-y-4">
        <div className="mx-auto h-9 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="mx-auto h-4 w-96 max-w-[80%] animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-800/80" />
      </div>

      {/* Products Grid Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div 
            key={i} 
            className="animate-pulse rounded-xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-sm"
          >
            <div className="aspect-square w-full rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="mt-4 space-y-3">
              <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-1/4 rounded bg-slate-200/80 dark:bg-slate-800/80" />
              <div className="pt-1">
                <div className="h-10 w-full rounded-lg bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}