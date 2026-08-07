"use client";

import dynamic from 'next/dynamic';

// هنا يسمح باستخدام { ssr: false } بحرية لأنه Client Component
export const CartDrawerWrapper = dynamic(
  () => import('./ClientCartDrawer').then((mod) => mod.ClientCartDrawer),
  { ssr: false }
);