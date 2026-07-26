// app/(storefront)/[storeSlug]/loading.tsx

import { Container } from '@/components/shared/Container';

export default function StoreLoading() {
  return (
    <Container maxWidth="xl">
      <div className="mb-8 text-center">
        <div className="mx-auto h-10 w-64 animate-pulse rounded-lg bg-gray-200" />
        <div className="mx-auto mt-4 h-5 w-96 animate-pulse rounded-lg bg-gray-200" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg border border-gray-100 bg-white p-4">
            <div className="aspect-square rounded-lg bg-gray-200" />
            <div className="mt-3 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gray-200" />
              <div className="h-4 w-1/3 rounded bg-gray-200" />
              <div className="h-10 w-full rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}