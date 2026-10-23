"use client";

import { useState } from "react";
import { toast } from "sonner";

import { repayOrder } from "@/services/api";

function opensPaymentPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

export function RepayOrderButton({ orderId }: { orderId: string }) {
  const [isPaying, setIsPaying] = useState(false);

  async function handlePay() {
    if (isPaying) return;
    setIsPaying(true);
    try {
      const result = await repayOrder(orderId);
      if (typeof result.paymentUrl === "string" && opensPaymentPage(result.paymentUrl)) {
        window.location.assign(result.paymentUrl);
        return;
      }
      toast.error("Не удалось получить ссылку на оплату");
      setIsPaying(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось перейти к оплате");
      setIsPaying(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handlePay}
      disabled={isPaying}
      className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4 w-full rounded-lg px-6 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPaying ? "Переходим к оплате..." : "Оплатить"}
    </button>
  );
}
