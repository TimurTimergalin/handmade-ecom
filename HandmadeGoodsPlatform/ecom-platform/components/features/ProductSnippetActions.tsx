"use client";

import { useEffect, useState } from "react";

import { AddToCartButton } from "./AddToCartButton";
import { BuyNowButton } from "./BuyNowButton";
import { useCartStore } from "@/store/cart";
import { cn } from "@/lib/utils";
import type { Product } from "@/types";

export function ProductSnippetActions({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  const storedInCart = useCartStore(
    (s) =>
      product.saleMode !== "deal_only" &&
      product.inStock > 0 &&
      s.items.some((item) => item.productId === product.id && item.quantity > 0)
  );
  const [cartReady, setCartReady] = useState(false);
  useEffect(() => setCartReady(true), []);
  const inCart = cartReady && storedInCart;

  return (
    <div className={cn("flex items-center gap-2", inCart && "grid grid-cols-2", className)}>
      <AddToCartButton
        productId={product.id}
        saleMode={product.saleMode}
        className={inCart ? undefined : "w-full"}
        counterClassName="h-7 w-full"
        maxQuantity={product.inStock}
      />
      {inCart && (
        <BuyNowButton
          productId={product.id}
          addIfMissing={false}
          className="h-7 w-full rounded-md px-2 py-0 text-xs leading-none whitespace-nowrap"
        >
          Купить
        </BuyNowButton>
      )}
    </div>
  );
}
