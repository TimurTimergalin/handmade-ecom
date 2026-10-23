"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { b2c, readData } from "@/lib/axios";
import { ORDER_STATUS_LABELS, ROUTES } from "@/lib/constants";
import type { ApiResponse, OrderStatus } from "@/types";

interface AdminOrder {
  id: string;
  number: string;
  status: OrderStatus;
  status_override: OrderStatus | null;
  delivery_method: string;
  total_amount: string;
  recipient_name: string;
  tracking_number: string | null;
  created_at: string;
}

  const STATUSES: OrderStatus[] = ["created", "paid", "shipped", "delivering", "delivered", "completed", "cancelled"];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function load() {
    const data = await readData(b2c.get<ApiResponse<AdminOrder[]>>("/api/admin/orders"));
    setOrders(data ?? []);
  }

  useEffect(() => {
    load().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить заказы");
    });
  }, []);

  async function setOverride(id: string, status: string) {
    setPendingId(id);
    setError(null);
    try {
      await readData(
        b2c.patch<ApiResponse<AdminOrder>>(`/api/admin/orders/${id}`, {
          status: status || null,
        })
      );
      await load();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить статус");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="container mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Заказы</h1>
      <p className="text-muted-foreground text-sm">
        Переопределение показывается покупателю и останавливает обновление статуса из оплаты и СДЭК.
        Пустое значение возвращает фактический статус.
      </p>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 font-medium">Заказ</th>
              <th className="px-3 py-2 font-medium">Факт</th>
              <th className="px-3 py-2 font-medium">Переопределение</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t">
                <td className="px-3 py-2">
                  <Link href={ROUTES.orderDetail(order.id)} className="font-medium hover:underline">
                    {order.number}
                  </Link>
                  <div className="text-muted-foreground text-xs">
                    {order.recipient_name} · {order.delivery_method}
                    {order.tracking_number ? ` · ${order.tracking_number}` : ""}
                  </div>
                </td>
                <td className="px-3 py-2">{ORDER_STATUS_LABELS[order.status]}</td>
                <td className="px-3 py-2">
                  <select
                    value={order.status_override ?? ""}
                    disabled={pendingId === order.id}
                    onChange={(event) => setOverride(order.id, event.target.value)}
                    className="bg-background rounded-md border px-2 py-1.5"
                  >
                    <option value="">Как есть</option>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {ORDER_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
