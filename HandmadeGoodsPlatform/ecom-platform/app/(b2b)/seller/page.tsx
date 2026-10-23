import Link from "next/link";

import { getOrdersBySeller, getSellerProducts } from "@/services/api";
import { ROUTES, ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatPrice, timeAgo, cn } from "@/lib/utils";

export default async function SellerDashboardPage() {
  const [orders, products] = await Promise.all([
    getOrdersBySeller(""),
    getSellerProducts(),
  ]);

  const newOrders = orders.filter((o) => o.status === "created" || o.status === "paid");
  const shippedOrders = orders.filter((o) => o.status === "shipped");
  const lowStock = products.filter((p) => p.inStock <= 3 && p.saleMode === "online");
  const recentOrders = orders.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Дашборд</h1>
        <p className="text-muted-foreground mt-1 text-sm">Сводка по вашему магазину</p>
      </div>

      {/* ↓ Вот эти четыре карточки — счётчики */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Новые заказы" value={newOrders.length} accent="amber" />
        <StatCard label="Отгружено" value={shippedOrders.length} accent="blue" />
        <StatCard label="Всего товаров" value={products.length} />
        <StatCard label="Заказов всего" value={orders.length} accent="green" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Последние заказы</h2>
            <Link href={ROUTES.seller.orders} className="text-primary text-xs hover:underline">
              Все заказы →
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">Пока нет заказов</p>
          ) : (
            <ul className="divide-y">
              {recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={ROUTES.seller.orderDetail(order.id)}
                    className="hover:bg-muted/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        #{order.id} · {order.buyer?.displayName ?? "Покупатель"}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {timeAgo(order.createdAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
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
                      <span className="text-sm font-medium">{formatPrice(order.total)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">Низкий сток</h2>
          {lowStock.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Все товары в достаточном количестве
            </p>
          ) : (
            <ul className="divide-y">
              {lowStock.map((p) => (
                <li key={p.id}>
                  <Link
                    href={ROUTES.seller.productEdit(p.id)}
                    className="hover:bg-muted/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors"
                  >
                    <span className="truncate text-sm font-medium">{p.title}</span>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {p.inStock} шт.
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href={ROUTES.seller.productNew}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-2.5 text-sm font-medium"
        >
          + Добавить товар
        </Link>
        <Link
          href={ROUTES.seller.postNew}
          className="hover:bg-muted rounded-lg border px-5 py-2.5 text-sm font-medium"
        >
          + Создать пост
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: number;
  accent?: "default" | "amber" | "blue" | "green";
}) {
  const accentClass = {
    default: "text-foreground",
    amber: "text-amber-600",
    blue: "text-blue-600",
    green: "text-green-600",
  }[accent];

  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", accentClass)}>{value}</div>
    </div>
  );
}
