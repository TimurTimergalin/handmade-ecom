"use client";

import Link from "next/link";
import Image from "next/image";

import { CartItemCard } from "./CartItemCard";
import { ROUTES } from "@/lib/constants";
import { pluralize } from "@/lib/utils";
import type { CartGroup as CartGroupType, Product } from "@/types";

export function CartGroup({
  group,
  productById,
}: {
  group: CartGroupType;
  productById: Map<string, Product>;
}) {
  const total = group.items.reduce((sum, item) => {
    const product = productById.get(item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

  const activeCount = group.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="flex items-center gap-3 border-b pb-3">
        <Image
          src={group.seller.avatar}
          alt={group.seller.displayName}
          width={36}
          height={36}
          className="shrink-0 rounded-full object-cover"
        />
        <Link
          href={ROUTES.sellerPublic(group.seller.username)}
          className="hover:text-primary truncate font-medium"
        >
          {group.seller.displayName}
        </Link>
      </div>

      {group.items.length > 0 && (
        <div className="divide-y">
          {group.items.map((item) => {
            const product = productById.get(item.productId);
            if (!product) return null;
            return <CartItemCard key={item.productId} item={item} product={product} />;
          })}
        </div>
      )}

      {group.unavailableItems.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <div className="text-muted-foreground mb-2 text-xs">Недоступны к заказу</div>
          <div className="divide-y">
            {group.unavailableItems.map((item) => {
              const product = productById.get(item.productId);
              if (!product) return null;
              return (
                <CartItemCard key={item.productId} item={item} product={product} unavailable />
              );
            })}
          </div>
        </div>
      )}

      {group.items.length > 0 && (
        <div className="mt-3 border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            {activeCount} {pluralize(activeCount, ["товар", "товара", "товаров"])} ·{" "}
          </span>
          <span className="text-base font-bold">{formatPriceShort(total)}</span>
        </div>
      )}
    </div>
  );
}

function formatPriceShort(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}
