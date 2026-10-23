"use client";

import { useRouter } from "next/navigation";

import { useCartStore } from "@/store/cart";
import { ensureBuyer } from "@/store/login-prompt";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function BuyNowButton({
  productId,
  disabled,
  className,
  addIfMissing = true,
  children = "Купить сейчас",
}: {
  productId: string;
  disabled?: boolean;
  className?: string;
  addIfMissing?: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || !ensureBuyer()) return;
    if (addIfMissing) addItem(productId);
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
      {children}
    </button>
  );
}
