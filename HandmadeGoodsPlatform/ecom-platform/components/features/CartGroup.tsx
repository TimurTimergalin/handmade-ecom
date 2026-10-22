"use client";

import Link from "next/link";
import Image from "next/image";
import { MapPin, Truck } from "lucide-react";

import { CartItemCard } from "./CartItemCard";
import { ROUTES, DELIVERY_LABELS } from "@/lib/constants";
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

  const activeCount = group.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="bg-card rounded-xl border p-4">
      {/* Заголовок группы */}
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

        <div className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1 text-xs">
          {group.delivery === "pickup" ? (
            <MapPin className="h-3 w-3" />
          ) : (
            <Truck className="h-3 w-3" />
          )}
          {DELIVERY_LABELS[group.delivery]}
        </div>
      </div>

      {/* Активные товары */}
      {group.items.length > 0 && (
        <div className="divide-y">
          {group.items.map((item) => {
            const product = productById.get(item.productId);
            if (!product) return null;
            return <CartItemCard key={item.productId} item={item} product={product} />;
          })}
        </div>
      )}

      {/* Недоступные товары */}
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

      {/* Итог + кнопка */}
      {group.items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="text-muted-foreground text-sm">
            {activeCount} {pluralize(activeCount, ["товар", "товара", "товаров"])} ·{" "}
            <span className="text-foreground text-base font-bold">{formatPriceShort(total)}</span>
          </div>
          <Link
            href={ROUTES.checkout}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
          >
            К оформлению
          </Link>
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
