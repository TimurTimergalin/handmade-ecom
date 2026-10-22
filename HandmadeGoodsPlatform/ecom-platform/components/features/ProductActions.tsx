"use client";

import { useState } from "react";

import { AddToCartButton } from "./AddToCartButton";
import { BuyNowButton } from "./BuyNowButton";
import { DeliverySelector } from "./DeliverySelector";
import { SALE_MODE_LABELS } from "@/lib/constants";
import type { DeliveryMethod, Product } from "@/types";

export function ProductActions({ product }: { product: Product }) {
  const [delivery, setDelivery] = useState<DeliveryMethod>(product.availableDeliveries[0]);

  if (product.saleMode === "out_of_stock") {
    return (
      <div className="bg-muted text-muted-foreground rounded-lg px-4 py-3 text-center text-sm">
        {SALE_MODE_LABELS.out_of_stock}
      </div>
    );
  }

  if (product.saleMode === "deal_only") {
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
    <div className="flex flex-col gap-4">
      <DeliverySelector
        available={product.availableDeliveries}
        value={delivery}
        onChange={setDelivery}
      />

      <div className="flex flex-wrap gap-3">
        <AddToCartButton
          productId={product.id}
          saleMode={product.saleMode}
          delivery={delivery}
          className="mt-0 rounded-lg px-6 py-3 text-sm"
        />
        <BuyNowButton productId={product.id} delivery={delivery} />
      </div>
    </div>
  );
}
