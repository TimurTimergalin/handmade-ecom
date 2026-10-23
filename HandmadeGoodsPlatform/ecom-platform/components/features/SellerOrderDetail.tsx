"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Truck, MapPin } from "lucide-react";

import { updateOrderStatus } from "@/services/api";
import { DELIVERY_LABELS, ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatPrice, timeAgo, cn } from "@/lib/utils";
import type { Order, OrderStatus } from "@/types";

export function SellerOrderDetail({ order }: { order: Order }) {
  const router = useRouter();
  const [current, setCurrent] = useState(order);
  const [receivalCode, setReceivalCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setCurrent(order);
  }, [order]);

  async function changeStatus(newStatus: OrderStatus, trackingNumber?: string) {
    if (newStatus === "completed" && !/^\d{6}$/.test(trackingNumber ?? "")) {
      setCodeError("Введите код из 6 цифр");
      return;
    }
    if (newStatus === "completed") setCodeError("");

    setIsUpdating(true);
    try {
      const updated = await updateOrderStatus(
        current.id,
        newStatus,
        trackingNumber ? { trackingNumber } : undefined
      );
      setCurrent((prev) => ({
        ...prev,
        ...updated,
        buyer: updated.buyer ?? prev.buyer,
        seller: updated.seller ?? prev.seller,
        items: updated.items?.some((item) => item.product) ? updated.items : prev.items,
        trackingNumber: updated.trackingNumber ?? trackingNumber ?? prev.trackingNumber,
      }));
      setCodeError("");
      toast.success(`Статус изменён на «${ORDER_STATUS_LABELS[newStatus]}»`);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось изменить статус";
      if (newStatus === "completed") {
        setCodeError(
          message === "Неверный код выдачи" || message === "Зависимый сервис отклонил запрос"
            ? "Неверный код. Попросите покупателя ещё раз назвать код из деталей заказа."
            : message
        );
      } else {
        toast.error(message);
      }
    } finally {
      setIsUpdating(false);
    }
  }

  const isFinal =
    current.status === "completed" ||
    current.status === "cancelled" ||
    (current.status === "delivered" && current.delivery !== "pickup");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Заказ #{current.id}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{timeAgo(current.createdAt)}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium",
            current.status === "delivered" && "bg-green-100 text-green-800",
            current.status === "completed" && "bg-green-100 text-green-800",
            current.status === "cancelled" && "bg-red-100 text-red-800",
            current.status === "shipped" && "bg-blue-100 text-blue-800",
            current.status === "delivering" && "bg-blue-100 text-blue-800",
            (current.status === "paid" || current.status === "created") &&
              "bg-amber-100 text-amber-800"
          )}
        >
          {ORDER_STATUS_LABELS[current.status]}
        </span>
      </div>

      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">Доставка</h2>
        <div className="flex items-center gap-2 text-sm">
          {current.delivery === "pickup" ? (
            <MapPin className="text-muted-foreground h-4 w-4" />
          ) : (
            <Truck className="text-muted-foreground h-4 w-4" />
          )}
          <span>{DELIVERY_LABELS[current.delivery]}</span>
        </div>
        {current.pickupPoint && (
          <div className="text-muted-foreground pl-6 text-sm">
            {current.pickupPoint.city}, {current.pickupPoint.address}
          </div>
        )}
        {current.trackingNumber && current.delivery === "cdek" && (
          <div className="bg-muted/40 rounded-lg px-3 py-2">
            <div className="text-muted-foreground text-xs">Трек-номер</div>
            <div className="font-mono text-lg tracking-widest">{current.trackingNumber}</div>
          </div>
        )}
      </section>

      <section className="bg-card rounded-xl border p-4">
        <h2 className="mb-3 font-semibold">Состав заказа</h2>
        <ul className="divide-y">
          {current.items.map((item, index) => {
            const product = item.product;
            return (
              <li key={product?.id ?? index} className="flex gap-3 py-3">
                <div className="bg-muted relative h-12 w-12 shrink-0 overflow-hidden rounded-md">
                  {product?.image ? (
                    <Image
                      src={product.image}
                      alt={product.title}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 text-sm font-medium">{product?.title ?? "Товар"}</div>
                  <div className="text-muted-foreground text-xs">
                    {item.quantity} × {formatPrice(product?.price ?? 0)}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-medium">
                  {formatPrice((product?.price ?? 0) * item.quantity)}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <span className="font-medium">Итого</span>
          <span className="text-xl font-bold">{formatPrice(current.total)}</span>
        </div>
      </section>

      {!isFinal && (
        <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="font-semibold">Действия</h2>
          <div className="flex flex-wrap gap-2">
            {current.delivery === "pickup" && current.status === "paid" && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => changeStatus("delivered")}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                Готов к выдаче
              </button>
            )}
            {current.delivery === "pickup" &&
              (current.status === "delivered" || current.status === "shipped") && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">Код, который назвал покупатель</span>
                    <input
                      inputMode="numeric"
                      maxLength={6}
                      value={receivalCode}
                      aria-invalid={Boolean(codeError)}
                      onChange={(e) => {
                        setReceivalCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                        setCodeError("");
                      }}
                      placeholder="000000"
                      className={cn(
                        "bg-background w-32 rounded-md border px-3 py-2 font-mono text-sm outline-none",
                        codeError && "border-destructive"
                      )}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={isUpdating || !/^\d{6}$/.test(receivalCode)}
                    onClick={() => changeStatus("completed", receivalCode)}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    Подтвердить получение
                  </button>
                </div>
                {codeError ? <p className="text-destructive text-sm">{codeError}</p> : null}
              </div>
            )}
            {(current.status === "created" || current.status === "paid") && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => changeStatus("cancelled")}
                className="border-destructive text-destructive hover:bg-destructive/10 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                Отменить заказ
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
