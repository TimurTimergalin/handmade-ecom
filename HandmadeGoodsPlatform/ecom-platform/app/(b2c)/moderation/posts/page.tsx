"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { b2b, HttpError, readData } from "@/lib/axios";
import type { ApiResponse } from "@/types";

type PostModeration = {
  id: string;
  title: string;
  summary: string;
  body: string;
  coverImage: string | null;
  moderationStatus: "pending" | "active" | "rejected" | null;
  draftStatus: "pending" | "rejected" | null;
  draft: { title?: string; summary?: string; body?: string } | null;
};

export default function ModerationPostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostModeration[] | null>(null);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function load() {
    try {
      setPosts(await readData(b2b.get<ApiResponse<PostModeration[]>>("/api/moderation/posts")));
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        router.replace("/moderation/login");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить публикации");
      setPosts([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function accept(id: string) {
    setPendingId(id);
    try {
      await readData(b2b.post<ApiResponse<unknown>>(`/api/moderation/posts/${id}/accept`));
      toast.success("Публикация принята");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось принять публикацию");
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
        b2b.post<ApiResponse<unknown>>(`/api/moderation/posts/${id}/reject`, { reason: text })
      );
      toast.success("Публикация отклонена");
      setReasonFor(null);
      setReason("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отклонить публикацию");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <Link href="/moderation" className="text-muted-foreground w-fit text-sm hover:underline">
        К разделам
      </Link>
      <h1 className="text-2xl font-semibold">Публикации</h1>
      {posts === null ? (
        <p className="text-muted-foreground text-sm">Загрузка...</p>
      ) : posts.length === 0 ? (
        <p className="text-muted-foreground text-sm">Нет публикаций на рассмотрении.</p>
      ) : (
        posts.map((item) => (
          <section key={item.id} className="bg-card flex flex-col gap-3 rounded-xl border p-4">
            <h2 className="font-medium">
              {item.moderationStatus === "pending" ? "Новая публикация" : "Изменение"}: {item.title}
            </h2>
            {item.draftStatus === "pending" && item.draft && (
              <p className="text-sm">
                {item.title} → {item.draft.title || item.title}
              </p>
            )}
            <p className="text-muted-foreground text-sm whitespace-pre-line">
              {item.draft?.summary || item.summary || "Без описания"}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pendingId === item.id}
                onClick={() => accept(item.id)}
                className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Принять
              </button>
              <button
                type="button"
                disabled={pendingId === item.id}
                onClick={() => {
                  setReasonFor(item.id);
                  setReason("");
                }}
                className="rounded-lg border border-red-600 px-4 py-2 text-sm font-medium text-red-700"
              >
                Отклонить
              </button>
            </div>
            {reasonFor === item.id && (
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
                  disabled={pendingId === item.id}
                  onClick={() => reject(item.id)}
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
