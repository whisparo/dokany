// src/components/storefront/ClientCartDrawer.tsx
'use client';

import dynamic from 'next/dynamic';

// ⚡ مسموح بـ ssr: false هنا لأن الملف عليه 'use client'
const CartDrawer = dynamic(
  () => import('./CartDrawer').then((mod) => mod.CartDrawer),
  { ssr: false }
);

export function ClientCartDrawer() {
  return <CartDrawer />;
}