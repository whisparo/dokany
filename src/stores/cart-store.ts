// src/stores/cart-store.ts

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

// ============================================================
// 📦 الأنواع (Types) - تم تنظيفها تماماً وفصل مسؤوليات الـ Item عن الـ Store
// ============================================================

export interface CartItem {
  id: string;          /** معرف فريد (productId_variantId أو productId) */
  productId: string;
  variantId?: string;
  name: string;
  price: number;       /** السعر بالقرش (integer) */
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
  isOpen: boolean; // 👈 إضافة حالة الفتح والغلق
  
  // حالة المزامنة
  isSyncing: boolean;
  lastSyncedAt: number | null;
  syncError: string | null;
  lastSyncFailed: boolean;
  hasHydrated: boolean;
  
  // عمليات السلة
  setIsOpen: (open: boolean) => void; // 👈 إضافة دوال التحكم بالفتح
  toggleCart: () => void;            // 👈 إضافة تبديل الحالة
  addItem: (item: Omit<CartItem, 'id' | 'quantity'> & { id?: string; quantity?: number }) => void;
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
// 🛠️ Utilities الداعمة للعمليات
// ============================================================

export const createCartItemKey = (
  productId: string,
  variantId?: string
): string => {
  return variantId ? `${productId}_${variantId}` : productId;
};

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
      (set, get) => {
        // ✅ Closure-scoped variables معزولة تماماً للمزامنة
        let syncTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let activeAbortController: AbortController | null = null;
        let validateAbortController: AbortController | null = null;
        
        // ============================================================
        // 🔧 دوال مساعدة داخلية
        // ============================================================
        
        const recalculateTotals = (items: CartItem[]) => {
          const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
          const totalPrice = items.reduce(
            (sum, i) => sum + Math.round(i.price * i.quantity),
            0
          );
          return { totalQuantity, totalPrice };
        };
        
        const validateItem = (item: Partial<CartItem>): boolean => {
          if (!item.productId || !item.name) {
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
        
        // ============================================================
        // 🎯 Store Methods
        // ============================================================
        
        return {
          // الحالة الابتدائية
          items: [],
          totalQuantity: 0,
          totalPrice: 0,
          isOpen: false, // 👈 القيمة الافتراضية مغلق
          isSyncing: false,
          lastSyncedAt: null,
          syncError: null,
          lastSyncFailed: false,
          hasHydrated: false,
          
          setHasHydrated: (state: boolean) => set({ hasHydrated: state }),
          setIsOpen: (open: boolean) => set({ isOpen: open }),
          toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
          
          // ============================================================
          // ➕ إضافة منتج (تم تعديلها لتظل السلة مغلقة عند الإضافة)
          // ============================================================
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
                } as CartItem,
              ];
            }
            
            set({
              items: updatedItems,
              isOpen: false, // 👈 🎯 تم التعديل هنا لتبقى مغلقة ولا تفتح في وجه العميل تلقائياً
              ...recalculateTotals(updatedItems),
            });
            
            triggerSync();
          },
          
          // ============================================================
          // ❌ حذف منتج
          // ============================================================
          removeItem: (id: string) => {
            const { items } = get();
            const updatedItems = items.filter((item) => item.id !== id);
            
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
          
          // ============================================================
          // 🗑️ تفريغ السلة
          // ============================================================
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
          
          // ============================================================
          // 🔄 المزامنة الآمنة
          // ============================================================
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
                const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
                
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
                
                if (!response.ok) {
                  throw new Error(`Sync failed with status ${response.status}`);
                }
                
                const data: CartSyncResponse = await response.json();
                const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
                const duration = endTime - startTime;
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
                console.error(`[Cart] Sync attempt ${attempt}/${MAX_SYNC_RETRIES} failed:`, error);
                
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
          
          // ============================================================
          // ✅ التحقق الصارم من المخزون (نسخة مصححة وخالية من أخطاء الـ Types)
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
              
              // 1. نقوم بالـ map والـ filter في خطوة واحدة ذكية وتحديد النوع كـ CartItem صريح
              const updatedItems: CartItem[] = items
                .map((item) => {
                  const validation = validated.find((v) => v.id === item.id);
                  
                  if (!validation) {
                    console.warn(`[Cart] Item ${item.id} is out of stock or deleted`);
                    return null;
                  }
                  
                  // نرجع كائن متوافق 100% مع الـ CartItem Interface
                  const updatedItem: CartItem = {
                    ...item,
                    quantity: Math.min(item.quantity, validation.maxStock),
                    maxStock: validation.maxStock, // الـ TypeScript الحين يعلم أنه متوافق
                    price: validation.currentPrice ?? item.price,
                  };
                  
                  return updatedItem;
                })
                // الفلترة للتخلص من الـ null والـ quantities الصفرية بطريقة يعشقها الـ TS compiler
                .filter((item): item is CartItem => item !== null && item.quantity > 0);
              
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
          
          getItemById: (id: string) => get().items.find((item) => item.id === id),
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
  return useCartStore((state) => state.hasHydrated ? state.items : []);
};

export const useCartTotal = () => {
  return useCartStore((state) => state.hasHydrated ? state.totalPrice : 0);
};

export const useCartCount = () => {
  return useCartStore((state) => state.hasHydrated ? state.totalQuantity : 0);
};

export const useIsCartReady = () => useCartStore((state) => state.hasHydrated);

export const useCartSyncState = () =>
  useCartStore((state) => ({
    isSyncing: state.isSyncing,
    syncError: state.syncError,
    lastSyncFailed: state.lastSyncFailed,
  }));

// ============================================================
// 🛠 *Utilities*
// ============================================================

export const formatPrice = (priceInCents: number): string => {
  return `${(priceInCents / 100).toFixed(2)} جنيه`;
};