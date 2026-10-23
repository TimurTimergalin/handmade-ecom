"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";

import { useCartStore } from "@/store/cart";
import { ROUTES } from "@/lib/constants";
import { formatPrice, cn } from "@/lib/utils";
import type { CartItem, Product } from "@/types";

export function CartItemCard({
  item,
  product,
  unavailable = false,
}: {
  item: CartItem;
  product: Product;
  unavailable?: boolean;
}) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const lineTotal = product.price * item.quantity;

  return (
    <div className={cn("flex items-start gap-3 py-3", unavailable && "opacity-60")}>
      <Link
        href={ROUTES.product(product.id)}
        className="bg-muted relative h-16 w-16 shrink-0 overflow-hidden rounded-md"
      >
        <Image src={product.image} alt={product.title} fill sizes="64px" className="object-cover" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={ROUTES.product(product.id)}
          className="hover:text-primary line-clamp-2 text-sm font-medium"
        >
          {product.title}
        </Link>

        <div className="text-muted-foreground text-sm">{formatPrice(product.price)}</div>

        {unavailable ? (
          <div className="text-destructive mt-1 text-xs font-medium">Нет в наличии</div>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateQuantity(product.id, item.quantity - 1)}
              disabled={item.quantity <= 1}
              className="hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-40"
              aria-label="Уменьшить"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="min-w-[2ch] text-center text-sm font-medium">{item.quantity}</span>
            <button
              type="button"
              onClick={() => updateQuantity(product.id, item.quantity + 1)}
              disabled={item.quantity >= product.inStock}
              className="hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-40"
              aria-label="Увеличить"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="text-sm font-bold">{formatPrice(lineTotal)}</div>
        <button
          type="button"
          onClick={() => removeItem(product.id)}
          className="text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Удалить"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
