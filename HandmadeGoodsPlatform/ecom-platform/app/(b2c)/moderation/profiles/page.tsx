"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { b2b, HttpError, readData } from "@/lib/axios";
import type { ApiResponse } from "@/types";

type ProfileChange = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatar: string;
  draft: { displayName?: string; bio?: string; avatar?: string };
};

export default function ModerationProfilesPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileChange[] | null>(null);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function load() {
    try {
      setProfiles(await readData(b2b.get<ApiResponse<ProfileChange[]>>("/api/moderation/profiles")));
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        router.replace("/moderation/login");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить изменения");
      setProfiles([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function accept(id: string) {
    setPendingId(id);
    try {
      await readData(b2b.post<ApiResponse<unknown>>(`/api/moderation/profiles/${id}/accept`));
      toast.success("Изменения профиля приняты");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось принять изменения");
    } finally {
      setPendingId(null);
    }
  }

  async function reject(id: string) {
    const text = reason.trim();
    if (!text) {
      toast.error("Укажите причину");
      return;
    }
    setPendingId(id);
    try {
      await readData(
        b2b.post<ApiResponse<unknown>>(`/api/moderation/profiles/${id}/reject`, { reason: text })
      );
      toast.success("Изменения профиля отклонены");
      setReasonFor(null);
      setReason("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отклонить изменения");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <Link href="/moderation" className="text-muted-foreground w-fit text-sm hover:underline">
        К разделам
      </Link>
      <h1 className="text-2xl font-semibold">Изменения профиля</h1>
      {profiles === null ? (
        <p className="text-muted-foreground text-sm">Загрузка...</p>
      ) : profiles.length === 0 ? (
        <p className="text-muted-foreground text-sm">Нет изменений на рассмотрении.</p>
      ) : (
        profiles.map((shop) => (
          <section key={shop.id} className="bg-card flex flex-col gap-3 rounded-xl border p-4">
            <h2 className="font-medium">@{shop.username}</h2>
            <p className="text-sm">
              Название: {shop.displayName} → {shop.draft.displayName || shop.displayName}
            </p>
            <p className="text-sm whitespace-pre-line">
              О магазине: {shop.bio || "—"} → {shop.draft.bio || "—"}
            </p>
            <div className="flex gap-3">
              {shop.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shop.avatar} alt="" className="h-16 w-16 rounded-full object-cover" />
              )}
              {shop.draft.avatar && shop.draft.avatar !== shop.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shop.draft.avatar} alt="" className="h-16 w-16 rounded-full object-cover" />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pendingId === shop.id}
                onClick={() => accept(shop.id)}
                className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Принять
              </button>
              <button
                type="button"
                disabled={pendingId === shop.id}
                onClick={() => {
                  setReasonFor(shop.id);
                  setReason("");
                }}
                className="rounded-lg border border-red-600 px-4 py-2 text-sm font-medium text-red-700"
              >
                Отклонить
              </button>
            </div>
            {reasonFor === shop.id && (
              <div className="flex flex-col gap-2">
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Причина отклонения"
                  rows={3}
                  className="rounded-md border px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={pendingId === shop.id}
                  onClick={() => reject(shop.id)}
                  className="w-fit rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  Отклонить с этой причиной
                </button>
              </div>
            )}
          </section>
        ))
      )}
    </main>
  );
}
