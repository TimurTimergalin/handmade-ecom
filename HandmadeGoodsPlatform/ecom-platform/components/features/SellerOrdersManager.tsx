"use client";

import { useState } from "react";
import Link from "next/link";
import { timeAgo, formatPrice, cn } from "@/lib/utils";
import { ROUTES, ORDER_STATUS_LABELS } from "@/lib/constants";
import type { Order, OrderStatus } from "@/types";

type Filter = "all" | "new" | "shipped" | "delivered" | "cancelled";

const TABS: { value: Filter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "new", label: "Новые" },
  { value: "shipped", label: "Отправленные" },
  { value: "delivered", label: "Доставленные" },
  { value: "cancelled", label: "Отменённые" },
];

export function SellerOrdersManager({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = orders.filter((o) => {
    if (filter === "all") return true;
    if (filter === "new") return o.status === "created" || o.status === "paid";
    return o.status === filter;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              filter === tab.value
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-muted-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card text-muted-foreground rounded-xl border p-12 text-center">
          Заказов в этой категории нет
        </div>
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <ul className="divide-y">
            {filtered.map((order) => (
              <li key={order.id}>
                <Link
                  href={ROUTES.seller.orderDetail(order.id)}
                  className="hover:bg-muted/40 flex items-center gap-4 p-4 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      #{order.id} · {order.buyer?.displayName ?? "Покупатель"}
                    </div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {timeAgo(order.createdAt)} ·{" "}
                      {(order.items ?? []).reduce((s, i) => s + i.quantity, 0)} товаров
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        order.status === "delivered" && "bg-green-100 text-green-800",
                        order.status === "completed" && "bg-green-100 text-green-800",
                        order.status === "cancelled" && "bg-red-100 text-red-800",
                        order.status === "shipped" && "bg-blue-100 text-blue-800",
                        order.status === "delivering" && "bg-blue-100 text-blue-800",
                        (order.status === "paid" || order.status === "created") &&
                          "bg-amber-100 text-amber-800"
                      )}
                    >
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                    <span className="text-sm font-bold">{formatPrice(order.total)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
