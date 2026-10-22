"use client";

import { useState } from "react";

import { AddToCartButton } from "./AddToCartButton";
import { DELIVERY_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DeliveryMethod, Product } from "@/types";

export function ProductSnippetActions({ product }: { product: Product }) {
  const [delivery, setDelivery] = useState<DeliveryMethod>(product.availableDeliveries[0]);

  const hasChoice = product.availableDeliveries.length > 1;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {hasChoice && (
        <div className="flex gap-1" role="group" aria-label="Способ доставки">
          {product.availableDeliveries.map((d) => {
            const active = delivery === d;
            return (
              <button
                key={d}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDelivery(d);
                }}
                className={cn(
                  "flex-1 rounded-md border px-1.5 py-1 text-[10px] font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {DELIVERY_LABELS[d]}
              </button>
            );
          })}
        </div>
      )}

      <AddToCartButton productId={product.id} saleMode={product.saleMode} delivery={delivery} />
    </div>
  );
}
