// src/components/storefront/CartSheet.tsx
'use client';

import React from 'react';
import Image from 'next/image';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

interface CartSheetProps {
  items: CartItem[];
  totalPrice: number;
  totalItemsCount: number;
  onClose: () => void;
  onUpdateQuantity: (id: string, q: number) => void;
  onRemove: (id: string) => void;
  onCheckout: () => void;
}

export function CartSheet({
  items,
  totalPrice,
  totalItemsCount,
  onClose,
  onUpdateQuantity,
  onRemove,
  onCheckout,
}: CartSheetProps) {
  return (
    /* 🌟 التعديل السحري الجديد:
       - العرض أصبح w-[70vw] على الموبايل لترك مساحة كافية للخلفية (30% من الشاشة مفتوح).
       - الحد الأقصى للعرض أصبح max-w-[280px] على الموبايل ليكون نحيفاً ورشيقاً جداً.
    */
    <div className="relative w-[70vw] max-w-[280px] sm:max-w-[380px] h-[100dvh] max-h-[100dvh] bg-white dark:bg-slate-900 shadow-2xl flex flex-col justify-between border-l border-slate-100 dark:border-slate-800 z-10 overflow-hidden">
      
      {/* 1. Header (ثابت) */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm sm:text-base font-black text-slate-950 dark:text-white">Shopping Cart</h2>
          <span className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-[10px] font-bold px-2 py-0.5 rounded-full">
            {totalItemsCount} items
          </span>
        </div>
        <button 
          onClick={onClose}
          className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-500 hover:text-slate-950 dark:hover:text-white"
          aria-label="Close cart"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 2. Products List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12">
            <div className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-2 animate-pulse">
              <svg className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
              </svg>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Your cart is empty</p>
          </div>
        ) : (
          items.map((item) => (
            <div 
              key={item.id} 
              className="flex gap-2.5 p-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:shadow-sm transition duration-300"
            >
              {/* Product Image */}
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 flex-shrink-0 bg-white">
                <Image 
                  src={item.image || '/images/placeholder.png'} 
                  alt={item.name} 
                  fill 
                  sizes="48px"
                  className="object-cover"
                />
              </div>

              {/* Product Details */}
              <div className="flex-1 flex flex-col justify-between py-0.5">
                <div>
                  <h3 className="text-[11px] sm:text-xs font-bold text-slate-950 dark:text-white line-clamp-1 leading-tight">
                    {item.name}
                  </h3>
                  <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 mt-0.5">
                    {item.price} EGP
                  </p>
                </div>

                {/* Counter & Remove */}
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 shadow-sm">
                    <button 
                      onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                      className="px-2 py-0.5 text-slate-500 hover:text-slate-950 dark:hover:text-white font-bold transition text-[10px]"
                    >
                      -
                    </button>
                    <span className="px-1 text-[10px] font-black text-slate-950 dark:text-white min-w-[10px] text-center">
                      {item.quantity}
                    </span>
                    <button 
                      onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                      className="px-2 py-0.5 text-slate-500 hover:text-slate-950 dark:hover:text-white font-bold transition text-[10px]"
                    >
                      +
                    </button>
                  </div>

                  <button 
                    onClick={() => onRemove(item.id)}
                    className="text-red-500 hover:text-red-600 text-[10px] font-bold p-1 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 3. Footer */}
      {items.length > 0 && (
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 space-y-2.5 flex-shrink-0 pb-safe-bottom">
          <div className="flex items-center justify-between text-xs font-black text-slate-950 dark:text-white">
            <span>Total:</span>
            <span>{totalPrice} EGP</span>
          </div>
          
          <button 
            type="button"
            className="w-full bg-slate-950 dark:bg-white text-white dark:text-slate-950 py-2.5 rounded-xl font-black text-xs hover:opacity-90 active:scale-[0.99] transition duration-150 shadow-md flex items-center justify-center gap-1.5"
            onClick={onCheckout}
          >
            Checkout
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>
      )}

    </div>
  );
}