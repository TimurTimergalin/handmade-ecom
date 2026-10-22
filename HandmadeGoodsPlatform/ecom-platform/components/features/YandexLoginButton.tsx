"use client";

"use client";

import { cn } from "@/lib/utils";

export function YandexLoginButton({
  intent = "login",
  isSellerIntent = false,
}: {
  intent?: "login" | "register";
  isSellerIntent?: boolean;
}) {
  function handleClick() {
    const base = process.env.NEXT_PUBLIC_B2C_URL || "http://localhost:8080";
    const url = new URL("/api/auth/yandex/start", base);
    url.searchParams.set("intent", isSellerIntent ? "seller" : "buyer");
    window.location.assign(url.toString());
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex w-full items-center justify-center gap-3 rounded-lg border px-6 py-3 text-sm font-medium transition-colors",
        "bg-[#fc3f1d] text-white hover:bg-[#e0381a]"
      )}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded bg-white text-xs font-bold text-[#fc3f1d]">
        Я
      </span>
      {intent === "login" ? "Войти через Яндекс" : "Продолжить с Яндекс"}
    </button>
  );
}
