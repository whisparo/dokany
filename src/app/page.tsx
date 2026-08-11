'use client';

import { useState, useEffect } from 'react';
import { QuickProductSheet } from '@/features/store-editor/components/sheets/QuickProductSheet';

export default function TestPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-slate-50">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">اختبار Quick Product Sheet 🚀</h1>
        
        <button
          onClick={() => setIsOpen(true)}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md font-medium cursor-pointer"
        >
          تجربة فتح الـ Sheet
        </button>
      </div>

      <QuickProductSheet
        storeId="test-store-123"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </main>
  );
}