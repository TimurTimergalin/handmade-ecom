"use client";

import { toast } from "sonner";

import { useCartStore } from "@/store/cart";
import { SALE_MODE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DeliveryMethod, SaleMode } from "@/types";

export function AddToCartButton({
  productId,
  saleMode,
  delivery,
  className,
}: {
  productId: string;
  saleMode: SaleMode;
  delivery: DeliveryMethod;
  className?: string;
}) {
  const addItem = useCartStore((s) => s.addItem);
  const isAvailable = saleMode === "online";

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAvailable) return;

    addItem(productId, delivery);
    toast.success("Товар добавлен в корзину");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isAvailable}
      className={cn(
        "mt-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        isAvailable
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-muted text-muted-foreground cursor-not-allowed",
        className
      )}
    >
      {isAvailable ? "В корзину" : SALE_MODE_LABELS[saleMode]}
    </button>
  );
}
