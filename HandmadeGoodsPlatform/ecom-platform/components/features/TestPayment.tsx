"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import {
  confirmTestPayment,
  confirmTestSubscription,
  getTestPayment,
  getTestSubscription,
} from "@/services/api";
import { ROUTES } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";

export function TestPayment() {
  const params = useSearchParams();
  const router = useRouter();
  const orderId = params.get("order") ?? "";
  const subscriptionId = params.get("subscription") ?? "";
  const [amount, setAmount] = useState<number | null>(null);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!orderId && !subscriptionId) {
      setError("В ссылке нет номера заказа");
      return;
    }
    let cancelled = false;
    const load = subscriptionId ? getTestSubscription(subscriptionId) : getTestPayment(orderId);
    load
      .then((payment) => {
        if (cancelled) return;
        setAmount(payment.amount);
        setPaid(payment.paid);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Не удалось открыть оплату");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, subscriptionId]);

  async function pay() {
    if ((!orderId && !subscriptionId) || paying) return;
    setPaying(true);
    try {
      const payment = subscriptionId
        ? await confirmTestSubscription(subscriptionId)
        : await confirmTestPayment(orderId);
      setPaid(payment.paid);
      setAmount(payment.amount);
      toast.success("Оплата прошла");
      router.push(subscriptionId ? "/seller/pricing?sync=1" : ROUTES.orders);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Не удалось оплатить");
      setPaying(false);
    }
  }

  return (
    <div className="container mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold">Тестовая оплата</h1>
      <p className="text-muted-foreground text-sm">
        Локальная заглушка вместо ЮKassa. Деньги не списываются.
      </p>
      <section className="bg-card flex flex-col gap-4 rounded-xl border p-4">
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {amount !== null ? <div className="text-3xl font-bold">{formatPrice(amount)}</div> : null}
        {paid ? (
          <Link href={ROUTES.orders} className="text-primary text-sm hover:underline">
            Заказ уже оплачен. Перейти к заказам
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void pay()}
            disabled={paying || (!orderId && !subscriptionId) || Boolean(error)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {paying ? "Оплачиваем..." : "Оплатить"}
          </button>
        )}
      </section>
    </div>
  );
}
