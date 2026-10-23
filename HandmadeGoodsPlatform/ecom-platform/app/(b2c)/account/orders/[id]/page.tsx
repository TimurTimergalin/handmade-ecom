import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Truck } from "lucide-react";

import { CancelOrderButton } from "@/components/features/CancelOrderButton";
import { RepayOrderButton } from "@/components/features/RepayOrderButton";
import { getOrder } from "@/services/api";
import { DELIVERY_LABELS, ORDER_STATUS_LABELS, ROUTES } from "@/lib/constants";
import { cn, formatPrice, timeAgo } from "@/lib/utils";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);

  if (!order) {
    notFound();
  }

  const pickupReady = order.delivery === "pickup" && (order.status === "delivered" || order.status === "shipped");
  const pickupCode = pickupReady ? order.receivalCode : null;

  return (
    <div className="container mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <Link href={ROUTES.orders} className="text-primary text-sm hover:underline">
        ← Мои заказы
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Заказ #{order.id}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{timeAgo(order.createdAt)}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium",
            order.status === "delivered" && "bg-green-100 text-green-800",
            order.status === "completed" && "bg-green-100 text-green-800",
            order.status === "cancelled" && "bg-red-100 text-red-800",
            order.status === "shipped" && "bg-blue-100 text-blue-800",
            order.status === "delivering" && "bg-blue-100 text-blue-800",
            (order.status === "paid" || order.status === "created") && "bg-amber-100 text-amber-800"
          )}
        >
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>

      <section className="bg-card flex flex-col gap-2 rounded-xl border p-4">
        <h2 className="font-semibold">Продавец</h2>
        <Link href={ROUTES.sellerPublic(order.seller.username)} className="text-primary text-sm hover:underline">
          {order.seller.displayName}
        </Link>
      </section>

      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">Доставка</h2>
        <div className="flex items-center gap-2 text-sm">
          {order.delivery === "pickup" ? (
            <MapPin className="text-muted-foreground h-4 w-4" />
          ) : (
            <Truck className="text-muted-foreground h-4 w-4" />
          )}
          <span>{DELIVERY_LABELS[order.delivery]}</span>
        </div>
        {order.pickupPoint && (
          <div className="text-muted-foreground pl-6 text-sm">
            {order.pickupPoint.city}, {order.pickupPoint.address}
          </div>
        )}
        {order.trackingNumber && order.delivery === "cdek" && (
          <div className="pl-6 text-sm">
            <span className="text-muted-foreground">Трек-номер: </span>
            <span className="font-mono">{order.trackingNumber}</span>
          </div>
        )}
      </section>

      <section className="bg-card rounded-xl border p-4">
        <h2 className="mb-3 font-semibold">Состав заказа</h2>
        <ul className="divide-y">
          {order.items.map((item) => (
            <li key={item.product.id} className="flex gap-3 py-3">
              <div className="bg-muted relative h-12 w-12 shrink-0 overflow-hidden rounded-md">
                <Image
                  src={item.product.image}
                  alt={item.product.title}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-1 text-sm font-medium">{item.product.title}</div>
                <div className="text-muted-foreground text-xs">
                  {item.quantity} × {formatPrice(item.product.price)}
                </div>
              </div>
              <div className="shrink-0 text-sm font-medium">
                {formatPrice(item.product.price * item.quantity)}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <span className="font-medium">Итого</span>
          <span className="text-xl font-bold">{formatPrice(order.total)}</span>
        </div>
        {order.status === "created" && <RepayOrderButton orderId={order.id} />}
        {(order.status === "created" ||
          order.status === "paid" ||
          (order.delivery === "pickup" &&
            (order.status === "delivered" || order.status === "shipped"))) && (
          <CancelOrderButton orderId={order.id} />
        )}
      </section>

      {pickupCode && (
        <section className="bg-card flex flex-col gap-2 rounded-xl border p-4">
          <h2 className="font-semibold">Код выдачи</h2>
          <p className="text-muted-foreground text-sm">Назовите этот код продавцу, когда заберёте заказ.</p>
          <div className="font-mono text-3xl tracking-widest">{pickupCode}</div>
        </section>
      )}
    </div>
  );
}
