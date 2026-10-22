"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useAuthStore } from "@/store/auth";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Внутренний путь из ?next=: один ведущий /, без // и /\ (open redirect). */
function safeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return null;
  }
  return raw;
}

function postAuthPath(isSellerIntent: boolean): string {
  const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
  if (next) return next;
  return isSellerIntent ? ROUTES.seller.onboarding : ROUTES.account;
}

export function EmailAuthForm({
  mode,
  isSellerIntent = false,
}: {
  mode: "login" | "register";
  isSellerIntent?: boolean;
}) {
  const loginWithEmail = useAuthStore((s) => s.loginWithEmail);
  const register = useAuthStore((s) => s.register);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email.includes("@")) {
      toast.error("Введите корректный email");
      return;
    }
    if (password.length < 6) {
      toast.error("Пароль должен быть не менее 6 символов");
      return;
    }

    setIsLoading(true);
    try {
      if (mode === "register") {
        await register(email, password);
      } else {
        await loginWithEmail(email, password);
      }
      toast.success(mode === "login" ? "Вы вошли!" : "Аккаунт создан!");
      // Полная загрузка: cookie auth-token из ответа API должна попасть в middleware.
      window.location.assign(postAuthPath(isSellerIntent));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Ошибка авторизации");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="bg-background focus:ring-primary/30 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Пароль</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Минимум 6 символов"
          required
          className="bg-background focus:ring-primary/30 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
        />
      </label>

      <button
        type="submit"
        disabled={isLoading}
        className={cn(
          "rounded-lg px-6 py-3 text-sm font-medium transition-colors",
          isLoading
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        {isLoading ? "Загрузка..." : mode === "login" ? "Войти" : "Зарегистрироваться"}
      </button>
    </form>
  );
}
