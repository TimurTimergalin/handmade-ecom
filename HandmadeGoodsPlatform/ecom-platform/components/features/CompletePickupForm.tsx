"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { completePickup } from "@/services/api";

export function CompletePickupForm({
  orderId,
  requireCode = true,
}: {
  orderId: string;
  requireCode?: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = !isSubmitting && (!requireCode || /^\d{6}$/.test(code));

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await completePickup(orderId, requireCode ? code : undefined);
      toast.success("Заказ завершён");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось подтвердить получение");
      setIsSubmitting(false);
    }
  }

  return (
    <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="font-semibold">Получение заказа</h2>
      <p className="text-muted-foreground text-sm">
        {requireCode
          ? "Введите код из 6 цифр, который назвал продавец."
          : "Подтвердите, что посылка у вас. После этого заказ будет завершён."}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        {requireCode && (
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Код выдачи</span>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="bg-background w-32 rounded-md border px-3 py-2 font-mono text-sm outline-none"
            />
          </label>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {isSubmitting ? "Проверяем..." : "Подтвердить получение"}
        </button>
      </div>
    </section>
  );
}
