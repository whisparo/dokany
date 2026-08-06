// src/components/storefront/ProductGrid/LocalReloadButton.tsx
'use client';

import Button from '@/components/shared/Button';
import { RotateCcw } from 'lucide-react';

export function LocalReloadButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="rounded-xl h-9 text-xs flex items-center gap-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      onClick={() => window.location.reload()}
    >
      <RotateCcw size={14} />
      <span>إعادة المحاولة</span>
    </Button>
  );
}