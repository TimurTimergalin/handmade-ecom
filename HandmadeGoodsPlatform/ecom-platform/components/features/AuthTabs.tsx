"use client";

import { useState } from "react";
import Link from "next/link";
import { EmailAuthForm } from "./EmailAuthForm";
import { YandexLoginButton } from "./YandexLoginButton";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function AuthTabs({
  mode,
  isSellerIntent = false,
}: {
  mode: "login" | "register";
  isSellerIntent?: boolean;
}) {
  const [tab, setTab] = useState<"email" | "yandex">("email");

  const title = mode === "login" ? "Вход в Handmade" : "Регистрация";
  const subtitle =
    mode === "login"
      ? "Выберите удобный способ входа"
      : isSellerIntent
        ? "Создайте аккаунт продавца за 1 минуту"
        : "Присоединяйтесь к сообществу Handmade";

  return (
    <div className="bg-card flex flex-col gap-6 rounded-xl border p-8 shadow-sm">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>
      </div>

      <div className="flex rounded-lg border p-1">
        <button
          type="button"
          onClick={() => setTab("email")}
          className={cn(
            "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
            tab === "email"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          По email
        </button>
        <button
          type="button"
          onClick={() => setTab("yandex")}
          className={cn(
            "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
            tab === "yandex"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Через Яндекс
        </button>
      </div>

      {tab === "email" ? (
        <EmailAuthForm mode={mode} isSellerIntent={isSellerIntent} />
      ) : (
        <YandexLoginButton intent={mode} isSellerIntent={isSellerIntent} />
      )}

      <div className="text-muted-foreground text-center text-sm">
        {mode === "login" ? (
          <>
            Нет аккаунта?{" "}
            <Link href={ROUTES.register} className="text-primary hover:underline">
              Зарегистрироваться
            </Link>
          </>
        ) : (
          <>
            Уже есть аккаунт?{" "}
            <Link href={ROUTES.login} className="text-primary hover:underline">
              Войти
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
