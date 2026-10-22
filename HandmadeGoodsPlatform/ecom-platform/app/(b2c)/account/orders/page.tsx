import Link from "next/link";

import { getOrders } from "@/services/api";
import { DELIVERY_LABELS, ORDER_STATUS_LABELS, ROUTES } from "@/lib/constants";
import { cn, formatPrice, timeAgo } from "@/lib/utils";

export default async function OrdersPage() {
  const orders = await getOrders();

  return (
    <div className="container mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-3xl font-bold">Мои заказы</h1>
        <p className="text-muted-foreground mt-1 text-sm">Список оформленных заказов</p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-card text-muted-foreground rounded-xl border p-12 text-center">
          Пока нет заказов
        </div>
      ) : (
        <ul className="bg-card divide-y overflow-hidden rounded-xl border">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={ROUTES.orderDetail(order.id)}
                className="hover:bg-muted/40 flex items-center justify-between gap-4 p-4 transition-colors"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    #{order.id} · {order.seller?.displayName ?? "Продавец"}
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {timeAgo(order.createdAt)} · {DELIVERY_LABELS[order.delivery]}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      order.status === "delivered" && "bg-green-100 text-green-800",
                      order.status === "cancelled" && "bg-red-100 text-red-800",
                      order.status === "shipped" && "bg-blue-100 text-blue-800",
                      (order.status === "paid" || order.status === "created") &&
                        "bg-amber-100 text-amber-800"
                    )}
                  >
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                  <span className="text-sm font-medium">{formatPrice(order.total)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
