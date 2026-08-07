//src/types/cart.ts
export interface CartItem {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
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

export interface CartStoreState {
  items: CartItem[];
  totalQuantity: number;
  totalPrice: number;
  isOpen: boolean;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  syncError: string | null;
  lastSyncFailed: boolean;
  hasHydrated: boolean;
}

export interface CartStoreActions {
  setIsOpen: (open: boolean) => void;
  toggleCart: () => void;
  addItem: (item: Omit<CartItem, 'id' | 'quantity'> & { id?: string; quantity?: number }) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  setHasHydrated: (state: boolean) => void;
  syncCart: () => Promise<void>;
  retrySync: () => Promise<void>;
  validateStock: () => Promise<void>;
  getItemById: (id: string) => CartItem | undefined;
  getItemCount: () => number;
}

export type CartStore = CartStoreState & CartStoreActions;