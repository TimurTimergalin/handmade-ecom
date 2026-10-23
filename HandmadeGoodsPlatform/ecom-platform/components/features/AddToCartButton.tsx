"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { useCartStore } from "@/store/cart";
import { ensureBuyer } from "@/store/login-prompt";
import { SALE_MODE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { SaleMode } from "@/types";

function stopCardNavigation(e: React.MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}

export function AddToCartButton({
  productId,
  saleMode,
  className,
  counterClassName,
  maxQuantity,
}: {
  productId: string;
  saleMode: SaleMode;
  className?: string;
  counterClassName?: string;
  maxQuantity?: number;
}) {
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const storedQuantity = useCartStore(
    (s) => s.items.find((item) => item.productId === productId)?.quantity ?? 0
  );
  const [cartReady, setCartReady] = useState(false);
  useEffect(() => setCartReady(true), []);
  const quantity = cartReady ? storedQuantity : 0;
  const isAvailable =
    saleMode !== "deal_only" && (maxQuantity == null || maxQuantity > 0);
  const atStockLimit = maxQuantity != null && quantity >= maxQuantity;

  function handleAdd(e: React.MouseEvent) {
    stopCardNavigation(e);
    if (!isAvailable || !ensureBuyer()) return;
    if (maxQuantity != null && maxQuantity < 1) return;

    addItem(productId);
  }

  function handleDecrease(e: React.MouseEvent) {
    stopCardNavigation(e);
    if (quantity <= 1) {
      removeItem(productId);
      return;
    }
    updateQuantity(productId, quantity - 1);
  }

  function handleIncrease(e: React.MouseEvent) {
    stopCardNavigation(e);
    if (atStockLimit) return;
    updateQuantity(productId, quantity + 1);
  }

  if (isAvailable && quantity > 0) {
    return (
      <div
        role="group"
        aria-label="Количество в корзине"
        onClick={stopCardNavigation}
        className={cn(
          "box-border flex h-7 w-full items-stretch overflow-hidden rounded-md border border-neutral-300 bg-white text-sm font-medium text-black",
          counterClassName
        )}
      >
        <button
          type="button"
          onClick={handleDecrease}
          className="flex h-full w-8 shrink-0 items-center justify-center bg-transparent [-webkit-tap-highlight-color:transparent] hover:bg-transparent active:bg-transparent"
          aria-label="Уменьшить"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="flex min-w-[2ch] flex-1 items-center justify-center">{quantity}</span>
        <button
          type="button"
          onClick={handleIncrease}
          disabled={atStockLimit}
          className={cn(
            "flex h-full w-8 shrink-0 items-center justify-center bg-transparent [-webkit-tap-highlight-color:transparent] hover:bg-transparent active:bg-transparent disabled:bg-transparent disabled:opacity-100",
            atStockLimit && "text-neutral-300"
          )}
          aria-label="Увеличить"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={!isAvailable}
      className={cn(
        "mt-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        isAvailable
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-muted text-muted-foreground cursor-not-allowed",
        className
      )}
    >
      {isAvailable
        ? "В корзину"
        : saleMode === "deal_only"
          ? SALE_MODE_LABELS.deal_only
          : SALE_MODE_LABELS.out_of_stock}
    </button>
  );
}
