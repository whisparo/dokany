// src/stores/cart-store.ts

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type { CartItem, CartSyncResponse, CartStore } from '@/types/cart';

// ============================================================
// 🛠️ Utilities & Helpers
// ============================================================

export const createCartItemKey = (productId: string, variantId?: string): string => {
  return variantId ? `${productId}_${variantId}` : productId;
};

export const formatPrice = (priceInCents: number): string => {
  return `${(priceInCents / 100).toFixed(2)} جنيه`;
};

const DEBOUNCE_DELAY_MS = 3000;
const MAX_SYNC_RETRIES = 3;
const MAX_QUANTITY = 999;

// ============================================================
// 🧠 الـ Store المحدث
// ============================================================

export const useCartStore = create<CartStore>()(
  devtools(
    persist(
      (set, get) => {
        let syncTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let activeAbortController: AbortController | null = null;
        let validateAbortController: AbortController | null = null;

        const recalculateTotals = (items: CartItem[]) => {
          const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
          const totalPrice = items.reduce(
            (sum, i) => sum + Math.round(i.price * i.quantity),
            0
          );
          return { totalQuantity, totalPrice };
        };

        const validateItem = (item: Partial<CartItem>): boolean => {
          if (!item.productId || !item.name) return false;
          if (typeof item.price !== 'number' || item.price < 0) return false;
          if (item.quantity !== undefined && (!Number.isInteger(item.quantity) || item.quantity < 1)) {
            return false;
          }
          return true;
        };

        const triggerSync = () => {
          if (syncTimeoutId !== null) {
            clearTimeout(syncTimeoutId);
            syncTimeoutId = null;
          }

          const state = get();
          if (state.items.length === 0) return;

          syncTimeoutId = setTimeout(() => {
            const currentState = get();
            if (currentState.items.length > 0 && !currentState.isSyncing) {
              currentState.syncCart();
            }
            syncTimeoutId = null;
          }, DEBOUNCE_DELAY_MS);
        };

        return {
          items: [],
          totalQuantity: 0,
          totalPrice: 0,
          isOpen: false,
          isSyncing: false,
          lastSyncedAt: null,
          syncError: null,
          lastSyncFailed: false,
          hasHydrated: false,

          setHasHydrated: (state: boolean) => set({ hasHydrated: state }),
          setIsOpen: (open: boolean) => set({ isOpen: open }),
          toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),

          addItem: (newItem) => {
            if (!validateItem(newItem)) return;

            const finalId = newItem.id || createCartItemKey(newItem.productId, newItem.variantId);
            const { items } = get();
            const quantityToAdd = Math.min(newItem.quantity ?? 1, MAX_QUANTITY);
            const existingIndex = items.findIndex((i) => i.id === finalId);

            let updatedItems: CartItem[];

            if (existingIndex >= 0) {
              const existing = items[existingIndex];
              const newQuantity = Math.min(
                existing.quantity + quantityToAdd,
                existing.maxStock ?? MAX_QUANTITY,
                MAX_QUANTITY
              );

              updatedItems = items.map((item, idx) =>
                idx === existingIndex ? { ...item, quantity: newQuantity } : item
              );
            } else {
              updatedItems = [
                ...items,
                {
                  id: finalId,
                  productId: newItem.productId,
                  variantId: newItem.variantId,
                  name: newItem.name,
                  price: newItem.price,
                  image: newItem.image,
                  maxStock: newItem.maxStock,
                  quantity: quantityToAdd,
                },
              ];
            }

            set({
              items: updatedItems,
              isOpen: false,
              ...recalculateTotals(updatedItems),
            });

            triggerSync();
          },

          removeItem: (id: string) => {
            const { items } = get();
            const updatedItems = items.filter((item) => item.id !== id);

            set({
              items: updatedItems,
              ...recalculateTotals(updatedItems),
            });

            triggerSync();
          },

          updateQuantity: (id: string, quantity: number) => {
            if (quantity < 0 || quantity > MAX_QUANTITY) return;

            const { items } = get();
            const existingIndex = items.findIndex((item) => item.id === id);

            if (existingIndex === -1) return;

            const existing = items[existingIndex];
            const maxAllowed = existing.maxStock ?? MAX_QUANTITY;
            const finalQuantity = Math.min(quantity, maxAllowed);

            if (finalQuantity === 0) {
              get().removeItem(id);
              return;
            }

            const updatedItems = items.map((item, idx) =>
              idx === existingIndex ? { ...item, quantity: finalQuantity } : item
            );

            set({
              items: updatedItems,
              ...recalculateTotals(updatedItems),
            });

            triggerSync();
          },

          clearCart: () => {
            if (syncTimeoutId !== null) {
              clearTimeout(syncTimeoutId);
              syncTimeoutId = null;
            }

            activeAbortController?.abort();
            activeAbortController = null;

            validateAbortController?.abort();
            validateAbortController = null;

            set({
              items: [],
              totalQuantity: 0,
              totalPrice: 0,
              isSyncing: false,
              syncError: null,
              lastSyncFailed: false,
            });
          },

          syncCart: async () => {
            const { items } = get();

            if (activeAbortController) {
              activeAbortController.abort();
              activeAbortController = null;
              await new Promise((resolve) => setTimeout(resolve, 0));
            }

            if (items.length === 0) {
              set({
                isSyncing: false,
                lastSyncedAt: Date.now(),
                syncError: null,
              });
              return;
            }

            activeAbortController = new AbortController();
            set({ isSyncing: true, syncError: null });

            let attempt = 0;

            while (attempt < MAX_SYNC_RETRIES) {
              try {
                const idempotencyKey = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                  ? crypto.randomUUID()
                  : Math.random().toString(36).substring(2, 15);

                const response = await fetch('/api/cart/sync', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': idempotencyKey,
                  },
                  body: JSON.stringify({
                    items: items.map((item) => ({
                      productId: item.productId,
                      variantId: item.variantId,
                      quantity: item.quantity,
                    })),
                  }),
                  signal: activeAbortController?.signal,
                });

                if (!response.ok) throw new Error(`Sync status: ${response.status}`);

                const data: CartSyncResponse = await response.json();

                if (data.warnings && data.warnings.length > 0) {
                  console.warn('[Cart] Sync warnings:', data.warnings);
                }

                set({
                  isSyncing: false,
                  lastSyncedAt: Date.now(),
                  syncError: null,
                  lastSyncFailed: false,
                });

                activeAbortController = null;
                return;
              } catch (error) {
                if ((error as Error).name === 'AbortError') return;

                attempt++;
                if (attempt >= MAX_SYNC_RETRIES) {
                  set({
                    isSyncing: false,
                    syncError: (error as Error).message,
                    lastSyncFailed: true,
                  });
                  activeAbortController = null;
                  return;
                }

                const delay = 1000 * Math.pow(2, attempt - 1);
                await new Promise((resolve) => setTimeout(resolve, delay));
              }
            }
          },

          retrySync: async () => {
            set({ syncError: null, lastSyncFailed: false });
            await get().syncCart();
          },

          validateStock: async () => {
            const { items } = get();
            if (items.length === 0) return;

            if (validateAbortController) validateAbortController.abort();
            validateAbortController = new AbortController();

            try {
              const response = await fetch('/api/cart/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  items: items.map((i) => ({
                    id: i.id,
                    productId: i.productId,
                    variantId: i.variantId,
                    quantity: i.quantity,
                  })),
                }),
                signal: validateAbortController.signal,
              });

              if (!response.ok) throw new Error('Stock validation failed');

              const { validated } = (await response.json()) as {
                validated: Array<{ id: string; maxStock: number; currentPrice?: number }>;
              };

              // ✅ الحل: نحدد نوع المصفوفة المعادة من الـ map لتشمل null صراحة، ثم نفلترها بأمان
              const mappedItems: (CartItem | null)[] = items.map((item) => {
                const validation = validated.find((v) => v.id === item.id);
                if (!validation) return null;

                const newQuantity = Math.min(item.quantity, validation.maxStock);
                if (newQuantity <= 0) return null;

                const updatedItem: CartItem = {
                  ...item,
                  quantity: newQuantity,
                  maxStock: validation.maxStock,
                  price: validation.currentPrice ?? item.price,
                };

                return updatedItem;
              });

              // ✅ الفلترة لتنقية المصفوفة من الـ null لتصبح CartItem[] صريحة
              const updatedItems: CartItem[] = mappedItems.filter(
                (item): item is CartItem => item !== null
              );

              set({
                items: updatedItems,
                ...recalculateTotals(updatedItems),
              });
            } catch (error) {
              if ((error as Error).name === 'AbortError') return;
              console.error('[Cart] Stock validation error:', error);
            } finally {
              validateAbortController = null;
            }
          },

          getItemById: (id: string) => get().items.find((item) => item.id === id),
          getItemCount: () => get().items.length,
        };
      },
      {
        name: 'dokany-cart-storage',
        partialize: (state) => ({
          items: state.items,
          totalQuantity: state.totalQuantity,
          totalPrice: state.totalPrice,
        }),
        version: 1,
        onRehydrateStorage: () => (state, error) => {
          if (error) console.error('[Cart] Rehydration failed:', error);
          state?.setHasHydrated(true);
        },
      }
    ),
    { name: 'CartStore' }
  )
);

// ============================================================
// 🎯 Selectors
// ============================================================

export const useCartItems = () => useCartStore((s) => (s.hasHydrated ? s.items : []));
export const useCartTotal = () => useCartStore((s) => (s.hasHydrated ? s.totalPrice : 0));
export const useCartCount = () => useCartStore((s) => (s.hasHydrated ? s.totalQuantity : 0));
export const useIsCartReady = () => useCartStore((s) => s.hasHydrated);
export const useCartSyncState = () =>
  useCartStore((s) => ({
    isSyncing: s.isSyncing,
    syncError: s.syncError,
    lastSyncFailed: s.lastSyncFailed,
  }));