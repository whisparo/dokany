// app/(storefront)/[storeSlug]/loading.tsx

export default function StoreLoading() {
  return (
    <main className="w-full max-w-7xl mx-auto px-4 py-6">
      {/* Hero / Header Skeleton */}
      <div className="flex flex-col items-center mb-8 gap-3">
        <div className="h-8 w-48 rounded-md bg-muted animate-pulse" />
        <div className="h-4 w-72 max-w-[80%] rounded-md bg-muted/60 animate-pulse" />
      </div>

      {/* Grid Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div 
            key={i} 
            className="rounded-xl border border-border/50 bg-card p-3 animate-pulse flex flex-col gap-3"
          >
            <div className="aspect-square w-full rounded-lg bg-muted" />
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted/70" />
            <div className="h-8 w-full rounded-md bg-muted mt-auto" />
          </div>
        ))}
      </div>
    </main>
  );
}