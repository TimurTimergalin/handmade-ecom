"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

import { getSellerSubscription, subscribePremium, syncSubscription } from "@/services/api";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils";
import type { PlanTier } from "@/types";

const FEATURES = [
  { label: "Товары", free: "до 10", premium: "без лимита" },
  { label: "Посты", free: "до 5", premium: "без лимита" },
  { label: "Публичная витрина", free: true, premium: true },
  { label: "Аналитика", free: false, premium: true },
  { label: "Приоритет в выдаче", free: false, premium: true },
  { label: "Комиссия платформы", free: "10%", premium: "5%" },
];

export function PricingPlans({ currentTier: initialTier = "free" }: { currentTier?: PlanTier }) {
  const [currentTier, setCurrentTier] = useState<PlanTier>(initialTier);
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSellerSubscription()
      .then((subscription) => {
        if (!cancelled) setCurrentTier(subscription.tier === "premium" ? "premium" : "free");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("sync") !== "1") return;
    let cancelled = false;

    async function pull() {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const result = await syncSubscription();
          if (cancelled) return;
          if (result.status === "confirmed" || result.tier === "premium") {
            setCurrentTier("premium");
            toast.success("Premium активирован");
            window.history.replaceState(null, "", "/seller/pricing");
            return;
          }
        } catch (error) {
          if (cancelled) return;
          toast.error(error instanceof Error ? error.message : "Не удалось подтвердить оплату");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    void pull();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubscribe() {
    setIsPaying(true);
    try {
      const payment = await subscribePremium();
      if (!payment.paymentUrl) {
        toast.error("Платёж не создан");
        setIsPaying(false);
        return;
      }
      window.location.assign(payment.paymentUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось начать оплату");
      setIsPaying(false);
    }
  }

  return (
    <>
      <div className="grid max-w-3xl gap-6 md:grid-cols-2">
        {/* Free */}
        <div
          className={cn(
            "bg-card flex flex-col gap-4 rounded-xl border p-6",
            currentTier === "free" && "border-primary ring-primary ring-1"
          )}
        >
          <div>
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-bold">Free</h2>
              {currentTier === "free" && (
                <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                  Текущий
                </span>
              )}
            </div>
            <div className="mt-2 text-3xl font-bold">0 ₽</div>
            <div className="text-muted-foreground text-xs">навсегда</div>
          </div>

          <ul className="flex flex-col gap-2 text-sm">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-center gap-2">
                {f.free === false ? (
                  <X className="text-muted-foreground h-4 w-4 shrink-0" />
                ) : (
                  <Check className="h-4 w-4 shrink-0 text-green-600" />
                )}
                <span className="flex-1">{f.label}</span>
                {typeof f.free === "string" && (
                  <span className="text-muted-foreground">{f.free}</span>
                )}
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled
            className="text-muted-foreground mt-auto cursor-not-allowed rounded-lg border px-5 py-2.5 text-sm font-medium"
          >
            {currentTier === "free" ? "Текущий план" : "Перейти на Free"}
          </button>
        </div>

        {/* Premium */}
        <div
          className={cn(
            "bg-card flex flex-col gap-4 rounded-xl border p-6",
            currentTier === "premium" && "border-primary ring-primary ring-1"
          )}
        >
          <div>
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-bold">Premium</h2>
              {currentTier === "premium" && (
                <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                  Текущий
                </span>
              )}
            </div>
            <div className="mt-2 text-3xl font-bold">
              {formatPrice(990)}
              <span className="text-muted-foreground text-sm font-normal">/мес</span>
            </div>
            <div className="text-muted-foreground text-xs">отмена в любой момент</div>
          </div>

          <ul className="flex flex-col gap-2 text-sm">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-green-600" />
                <span className="flex-1">{f.label}</span>
                {typeof f.premium === "string" && <span className="font-medium">{f.premium}</span>}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => void handleSubscribe()}
            disabled={currentTier === "premium" || isPaying}
            className={cn(
              "mt-auto rounded-lg px-5 py-2.5 text-sm font-medium transition-colors",
              currentTier === "premium" || isPaying
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {currentTier === "premium" ? "Активен" : isPaying ? "Переход к оплате..." : "Оформить Premium"}
          </button>
        </div>
      </div>
    </>
  );
}
