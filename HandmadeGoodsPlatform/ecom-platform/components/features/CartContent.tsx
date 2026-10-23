"use client";

import Link from "next/link";
import { useMemo } from "react";

import { CartGroup } from "./CartGroup";
import { useCartStore } from "@/store/cart";
import { groupCartItems, calculateTotal } from "@/lib/cart-utils";
import { ROUTES } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types";

export function CartContent({ allProducts }: { allProducts: Product[] }) {
  const items = useCartStore((s) => s.items);

  // Индекс товаров — один раз
  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of allProducts) map.set(p.id, p);
    return map;
  }, [allProducts]);

  // Группировка — только при изменении items
  const groups = useMemo(() => groupCartItems(items, allProducts), [items, allProducts]);

  const total = useMemo(() => calculateTotal(groups, allProducts), [groups, allProducts]);
  const canCheckout = groups.some((group) => group.items.length > 0);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-muted-foreground text-lg">Ваша корзина пуста</p>
        <Link
          href={ROUTES.home}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
        >
          На главную
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <CartGroup key={group.key} group={group} productById={productById} />
      ))}

      <div className="bg-card sticky bottom-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 shadow-sm">
        <div>
          <div className="text-muted-foreground text-sm">Итого по всем продавцам</div>
          <div className="text-xl font-bold">{formatPrice(total)}</div>
        </div>
        {canCheckout && (
          <Link
            href={ROUTES.checkout}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
          >
            К оформлению
          </Link>
        )}
      </div>
    </div>
  );
}
