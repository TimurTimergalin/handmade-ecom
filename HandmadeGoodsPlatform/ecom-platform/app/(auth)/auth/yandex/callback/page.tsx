"use client";

import { useEffect, useState } from "react";

import { b2c, readData } from "@/lib/axios";
import { ROUTES } from "@/lib/constants";
import type { ApiResponse, User } from "@/types";

export default function YandexCallbackPage() {
  const [message, setMessage] = useState("Завершаем вход через Яндекс…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error || !code || !state) {
      setMessage("Вход через Яндекс отменён. Вернитесь на страницу входа и попробуйте снова.");
      return;
    }

    readData(
      b2c.post<ApiResponse<{ user: User; next: string }>>("/api/auth/yandex", { code, state })
    )
      .then((data) => {
        const next = data?.next;
        const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : ROUTES.home;
        window.location.assign(safe);
      })
      .catch((err: unknown) => {
        setMessage(err instanceof Error ? err.message : "Не удалось войти через Яндекс");
      });
  }, []);

  return (
    <div className="bg-card rounded-xl border p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold">Яндекс ID</h1>
      <p className="text-muted-foreground mt-3 text-sm">{message}</p>
    </div>
  );
}
