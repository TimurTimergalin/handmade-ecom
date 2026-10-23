"use client";

import { AddToCartButton } from "./AddToCartButton";
import { BuyNowButton } from "./BuyNowButton";
import { SALE_MODE_LABELS, saleAvailability } from "@/lib/constants";
import type { Product } from "@/types";

export function ProductActions({ product }: { product: Product }) {
  const availability = saleAvailability(product);

  if (availability === "out_of_stock") {
    return (
      <div className="bg-muted text-muted-foreground rounded-lg px-4 py-3 text-center text-sm">
        {SALE_MODE_LABELS.out_of_stock}
      </div>
    );
  }

  if (availability === "deal_only") {
    return (
      <div className="rounded-lg border border-dashed px-4 py-3 text-sm">
        <div className="mb-1 font-medium">Товар продаётся по сделке</div>
        <div className="text-muted-foreground">Свяжитесь с продавцом напрямую для оформления.</div>
        {product.dealContacts && (
          <div className="mt-2 font-medium whitespace-pre-line">{product.dealContacts}</div>
        )}
      </div>
    );
  }

  return (
    <div className="grid w-full grid-cols-2 gap-2 md:gap-3">
      <AddToCartButton
        productId={product.id}
        saleMode={product.saleMode}
        className="mt-0 box-border h-11 w-full rounded-lg border border-transparent px-4 py-0 text-sm"
        counterClassName="box-border h-11 w-full rounded-lg"
        maxQuantity={product.inStock}
      />
      <BuyNowButton productId={product.id} className="box-border h-11 w-full px-4 py-0" />
    </div>
  );
}
