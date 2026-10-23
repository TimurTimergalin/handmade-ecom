"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { b2b, HttpError, readData } from "@/lib/axios";
import type { ApiResponse } from "@/types";

export default function ModerationLoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await readData(
        b2b.post<ApiResponse<{ ok: boolean }>>("/api/moderation/login", { login, password })
      );
      router.push("/moderation");
    } catch (error) {
      toast.error(error instanceof HttpError ? error.message : "Не удалось войти");
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4">
      <form onSubmit={submit} className="bg-card flex flex-col gap-4 rounded-xl border p-6">
        <h1 className="text-xl font-semibold">Модерация</h1>
        <label className="flex flex-col gap-1 text-sm">
          Логин
          <input
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            className="rounded-md border px-3 py-2"
            autoComplete="username"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Пароль
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-md border px-3 py-2"
            autoComplete="current-password"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Входим..." : "Войти"}
        </button>
      </form>
    </main>
  );
}
