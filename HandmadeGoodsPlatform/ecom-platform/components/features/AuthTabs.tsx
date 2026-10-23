"use client";

import { YandexLoginButton } from "./YandexLoginButton";

export function AuthTabs({
  isSellerIntent = false,
}: {
  mode?: "login" | "register";
  isSellerIntent?: boolean;
}) {
  return (
    <div className="bg-card flex flex-col gap-6 rounded-xl border p-8 shadow-sm">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Вход в Handmade</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {isSellerIntent
            ? "Войдите через Яндекс ID, чтобы открыть магазин"
            : "Войдите через Яндекс ID"}
        </p>
      </div>

      <YandexLoginButton isSellerIntent={isSellerIntent} />
    </div>
  );
}
