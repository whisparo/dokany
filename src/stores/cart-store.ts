// src/stores/cart-store.ts

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

// ============================================================
// 📦 الأنواع (Types)
// ============================================================

export interface CartItem {
  /** معرف فريد (productId + variantId) */
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  /** السعر بالقرش (integer) - للقراءة والعرض المحلي فقط */
  price: number;
  quantity: number;
  image?: string;
  maxStock?: number;
}

export interface CartSyncResponse {
  success: boolean;
  syncedAt: string;
  warnings?: Array<{
    itemId: string;
    message: string;
  }>;
}

export interface CartStore {
  // الحالة (State)
  items: CartItem[];
  totalQuantity: number;
  totalPrice: number;
  
  // حالة المزامنة
  isSyncing: boolean;
  lastSyncedAt: number | null;
  syncError: string | null;
  lastSyncFailed: boolean;
  hasHydrated: boolean;
  
  // عمليات السلة
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  setHasHydrated: (state: boolean) => void;
  
  // المزامنة والتحقق
  syncCart: () => Promise<void>;
  retrySync: () => Promise<void>;
  validateStock: () => Promise<void>;
  
  // Helpers
  getItemById: (id: string) => CartItem | undefined;
  getItemCount: () => number;
}

// ============================================================
// 🛠️ الثوابت (Constants)
// ============================================================

const DEBOUNCE_DELAY_MS = 3000;
const MAX_SYNC_RETRIES = 3;
const MAX_QUANTITY = 999;

// ============================================================
// 🧠 إنشاء الـ Store الحصين
// ============================================================

export const useCartStore = create<CartStore>()(
  devtools(
    persist(
      (set: (state: Partial<CartStore> | ((state: CartStore) => Partial<CartStore>)) => void, get: () => CartStore) => {
        // ✅ Closure-scoped variables معزولة تماماً
        let syncTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let activeAbortController: AbortController | null = null;
        let validateAbortController: AbortController | null = null;
        
        // ============================================================
        // 🔧 دوال مساعدة داخلية
        // ============================================================
        
        const recalculateTotals = (items: CartItem[]) => {
          const totalQuantity = items.reduce((sum, i: CartItem) => sum + i.quantity, 0);
          const totalPrice = items.reduce(
            (sum, i: CartItem) => sum + Math.round(i.price * i.quantity),
            0
          );
          return { totalQuantity, totalPrice };
        };
        
        // ✅ تحسين: إضافة تحقق من quantity
        const validateItem = (item: Partial<CartItem>): boolean => {
          if (!item.id || !item.productId || !item.name) {
            console.error('[Cart] Invalid item: missing required fields', item);
            return false;
          }
          if (typeof item.price !== 'number' || item.price < 0) {
            console.error('[Cart] Invalid price:', item.price);
            return false;
          }
          if (item.quantity !== undefined) {
            if (!Number.isInteger(item.quantity) || item.quantity < 1) {
              console.error('[Cart] Invalid quantity:', item.quantity);
              return false;
            }
          }
          return true;
        };
        
        // ✅ تحسين: التحقق من وجود عناصر قبل الجدولة
        const triggerSync = () => {
          if (syncTimeoutId !== null) {
            clearTimeout(syncTimeoutId);
            syncTimeoutId = null;
          }
          
          // ✅ التحقق المبكر
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
        
        // ============================================================
        // 🎯 Store Methods
        // ============================================================
        
        return {
          // الحالة الابتدائية
          items: [],
          totalQuantity: 0,
          totalPrice: 0,
          isSyncing: false,
          lastSyncedAt: null,
          syncError: null,
          lastSyncFailed: false,
          hasHydrated: false,
          
          setHasHydrated: (state: boolean) => set({ hasHydrated: state }),
          
          // ============================================================
          // ➕ إضافة منتج
          // ============================================================
          addItem: (newItem: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
            if (!validateItem(newItem)) return;
            
            const { items } = get();
            const quantityToAdd = Math.min(newItem.quantity ?? 1, MAX_QUANTITY);
            const existingIndex = items.findIndex((i: CartItem) => i.id === newItem.id);
            
            let updatedItems: CartItem[];
            
            if (existingIndex >= 0) {
              const existing = items[existingIndex];
              const newQuantity = Math.min(
                existing.quantity + quantityToAdd,
                existing.maxStock ?? MAX_QUANTITY,
                MAX_QUANTITY
              );
              
              updatedItems = items.map((item: CartItem, idx: number) =>
                idx === existingIndex ? { ...item, quantity: newQuantity } : item
              );
            } else {
              updatedItems = [
                ...items,
                { ...newItem, quantity: quantityToAdd } as CartItem,
              ];
            }
            
            set({
              items: updatedItems,
              ...recalculateTotals(updatedItems),
            });
            
            triggerSync();
          },
          
          // ============================================================
          // ❌ حذف منتج
          // ============================================================
          removeItem: (id: string) => {
            const { items } = get();
            const updatedItems = items.filter((item: CartItem) => item.id !== id);
            
            set({
              items: updatedItems,
              ...recalculateTotals(updatedItems),
            });
            
            triggerSync();
          },
          
          // ============================================================
          // ✏️ تحديث الكمية
          // ============================================================
          updateQuantity: (id: string, quantity: number) => {
            if (quantity < 0 || quantity > MAX_QUANTITY) {
              console.error('[Cart] Invalid quantity:', quantity);
              return;
            }
            
            const { items } = get();
            const existingIndex = items.findIndex((item: CartItem) => item.id === id);
            
            if (existingIndex === -1) return;
            
            const existing = items[existingIndex];
            const maxAllowed = existing.maxStock ?? MAX_QUANTITY;
            const finalQuantity = Math.min(quantity, maxAllowed);
            
            if (finalQuantity === 0) {
              get().removeItem(id);
              return;
            }
            
            const updatedItems = items.map((item: CartItem, idx: number) =>
              idx === existingIndex ? { ...item, quantity: finalQuantity } : item
            );
            
            set({
              items: updatedItems,
              ...recalculateTotals(updatedItems),
            });
            
            triggerSync();
          },
          
          // ============================================================
          // 🗑️ تفريغ السلة
          // ============================================================
          clearCart: () => {
            // ✅ إلغاء أي sync مؤجل
            if (syncTimeoutId !== null) {
              clearTimeout(syncTimeoutId);
              syncTimeoutId = null;
            }
            
            // ✅ إلغاء آمن باستخدام الـ Optional Chaining
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
          
          // ============================================================
          // 🔄 المزامنة الآمنة
          // ============================================================
          syncCart: async () => {
            const { items } = get();
            
            // ✅ إلغاء آمن باستخدام الـ Optional Chaining
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
                const startTime = performance.now();
                
                const response = await fetch('/api/cart/sync', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': crypto.randomUUID(),
                  },
                  body: JSON.stringify({
                    items: items.map((item: CartItem) => ({
                      productId: item.productId,
                      variantId: item.variantId,
                      quantity: item.quantity,
                    })),
                  }),
                  signal: activeAbortController?.signal,
                });
                
                if (!response.ok) {
                  throw new Error(`Sync failed with status ${response.status}`);
                }
                
                const data: CartSyncResponse = await response.json();
                const duration = performance.now() - startTime;
                console.log(`[Cart] Sync completed in ${duration.toFixed(2)}ms`);
                
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
                if ((error as Error).name === 'AbortError') {
                  console.log('[Cart] Sync cancelled by new request');
                  return;
                }
                
                attempt++;
                console.error(
                  `[Cart] Sync attempt ${attempt}/${MAX_SYNC_RETRIES} failed:`,
                  error
                );
                
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
          
          // ============================================================
          // 🔁 إعادة محاولة المزامنة
          // ============================================================
          retrySync: async () => {
            set({ syncError: null, lastSyncFailed: false });
            await get().syncCart();
          },
          
          // ============================================================
          // ✅ التحقق الصارم من المخزون
          // ============================================================
          validateStock: async () => {
            const { items } = get();
            if (items.length === 0) return;
            
            if (validateAbortController) {
              validateAbortController.abort();
            }
            
            validateAbortController = new AbortController();
            
            try {
              const response = await fetch('/api/cart/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  items: items.map((i: CartItem) => ({
                    id: i.id,
                    productId: i.productId,
                    variantId: i.variantId,
                    quantity: i.quantity,
                  })),
                }),
                signal: validateAbortController.signal,
              });
              
              if (!response.ok) throw new Error('Stock validation failed');
              
              // ✅ حماية كسر النوع بالأمان الصارم لعدم قراءة unknown
              const { validated } = (await response.json()) as {
                validated: Array<{ id: string; maxStock: number; currentPrice?: number }>;
              };
              
              const updatedItems = items
                .map((item: CartItem) => {
                  const validation = validated.find(
                    (v: { id: string; maxStock: number; currentPrice?: number }) =>
                      v.id === item.id
                  );
                  
                  if (!validation) {
                    console.warn(`[Cart] Item ${item.id} is out of stock or deleted`);
                    return null;
                  }
                  
                  return {
                    ...item,
                    quantity: Math.min(item.quantity, validation.maxStock),
                    maxStock: validation.maxStock,
                    price: validation.currentPrice ?? item.price,
                  };
                })
                .filter((item) => item !== null && item.quantity > 0) as CartItem[];
              
              set({
                items: updatedItems,
                ...recalculateTotals(updatedItems),
              });
            } catch (error) {
              if ((error as Error).name === 'AbortError') {
                console.log('[Cart] Validation cancelled');
                return;
              }
              console.error('[Cart] Stock validation error:', error);
            } finally {
              validateAbortController = null;
            }
          },
          
          // ============================================================
          // 🔍 Helpers
          // ============================================================
          getItemById: (id: string) => get().items.find((item: CartItem) => item.id === id),
          getItemCount: () => get().items.length,
        };
      },
      {
        name: 'dokany-cart-storage',
        partialize: (state: CartStore) => ({
          items: state.items,
          totalQuantity: state.totalQuantity,
          totalPrice: state.totalPrice,
        }),
        version: 1,
        onRehydrateStorage: () => (state: CartStore | undefined, error: unknown) => {
          if (error) {
            console.error('[Cart] Failed to rehydrate:', error);
          }
          state?.setHasHydrated(true);
        },
      }
    ),
    { name: 'CartStore' }
  )
);

// ============================================================
// 🎯 Selectors المحسّنة
// ============================================================

export const useCartItems = () => {
  return useCartStore((state: CartStore) => 
    state.hasHydrated ? state.items : []
  );
};

export const useCartTotal = () => {
  return useCartStore((state: CartStore) => 
    state.hasHydrated ? state.totalPrice : 0
  );
};

export const useCartCount = () => {
  return useCartStore((state: CartStore) => 
    state.hasHydrated ? state.totalQuantity : 0
  );
};

export const useIsCartReady = () => useCartStore((state: CartStore) => state.hasHydrated);

export const useCartSyncState = () =>
  useCartStore((state: CartStore) => ({
    isSyncing: state.isSyncing,
    syncError: state.syncError,
    lastSyncFailed: state.lastSyncFailed,
  }));
// ============================================================
// 🛠️ Utilities
// ============================================================

export const formatPrice = (priceInCents: number): string => {
  return `${(priceInCents / 100).toFixed(2)} جنيه`;
};

export const createCartItemKey = (
  productId: string,
  variantId?: string
): string => {
  return variantId ? `${productId}_${variantId}` : productId;
};