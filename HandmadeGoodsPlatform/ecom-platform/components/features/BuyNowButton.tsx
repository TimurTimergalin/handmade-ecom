"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCartStore } from "@/store/cart";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DeliveryMethod } from "@/types";

export function BuyNowButton({
  productId,
  delivery,
  disabled,
  className,
}: {
  productId: string;
  delivery: DeliveryMethod;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);

  function handleClick() {
    if (disabled) return;
    addItem(productId, delivery);
    toast.success("Товар добавлен. Переходим к оформлению...");
    router.push(ROUTES.checkout);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "rounded-lg px-6 py-3 text-sm font-medium transition-colors",
        disabled
          ? "bg-muted text-muted-foreground cursor-not-allowed"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
        className
      )}
    >
      Купить сейчас
    </button>
  );
}
