import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CartItem, DeliveryMethod } from "@/types";

interface CartState {
  // Состояние
  items: CartItem[];
  addItem: (productId: string, delivery: DeliveryMethod, quantity?: number) => void;
  removeItem: (productId: string, delivery: DeliveryMethod) => void;
  updateQuantity: (productId: string, delivery: DeliveryMethod, quantity: number) => void;
  clear: () => void;

  // Селектор (вычисляемое)
  totalCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (productId, delivery, quantity = 1) => {
        set((state) => {
          const existing = state.items.find(
            (i) => i.productId === productId && i.delivery === delivery
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === productId && i.delivery === delivery
                  ? { ...i, quantity: i.quantity + quantity }
                  : i
              ),
            };
          }
          return { items: [...state.items, { productId, delivery, quantity }] };
        });
      },

      removeItem: (productId, delivery) => {
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.productId === productId && i.delivery === delivery)
          ),
        }));
      },

      updateQuantity: (productId, delivery, quantity) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId && i.delivery === delivery ? { ...i, quantity } : i
          ),
        }));
      },

      clear: () => set({ items: [] }),

      totalCount: () => {
        return get().items.reduce((sum, i) => sum + i.quantity, 0);
      },
    }),
    { name: "cart-storage" }
  )
);
