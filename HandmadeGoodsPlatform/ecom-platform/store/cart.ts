import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CartItem } from "@/types";

interface CartState {
  items: CartItem[];
  addItem: (productId: string, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  totalCount: () => number;
}

/** Старые записи могли хранить delivery и дубли одного товара. Схлопываем в одну строку. */
export function normalizeCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];

  const quantities = new Map<string, number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { productId?: unknown; quantity?: unknown };
    if (typeof record.productId !== "string" || record.productId.length === 0) continue;
    const quantity =
      typeof record.quantity === "number" ? record.quantity : Number(record.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    quantities.set(record.productId, (quantities.get(record.productId) ?? 0) + Math.floor(quantity));
  }

  return Array.from(quantities, ([productId, quantity]) => ({ productId, quantity }));
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (productId, quantity = 1) => {
        set((state) => {
          const existing = state.items.find((item) => item.productId === productId);
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.productId === productId
                  ? { productId, quantity: item.quantity + quantity }
                  : item
              ),
            };
          }
          return { items: [...state.items, { productId, quantity }] };
        });
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((item) => item.productId !== productId),
        }));
      },

      updateQuantity: (productId, quantity) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.productId === productId ? { productId, quantity } : item
          ),
        }));
      },

      clear: () => set({ items: [] }),

      totalCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    {
      name: "cart-storage",
      version: 1,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as { items?: unknown };
        return { items: normalizeCartItems(state.items) };
      },
      merge: (persisted, current) => {
        const state = (persisted ?? {}) as { items?: unknown };
        return {
          ...current,
          items: normalizeCartItems(state.items),
        };
      },
    }
  )
);
