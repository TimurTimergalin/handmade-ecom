"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { b2b, HttpError, readData } from "@/lib/axios";
import type { ApiResponse } from "@/types";

type ProductModeration = {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  moderationStatus: "pending" | "active" | "rejected";
  draftStatus: "pending" | "rejected" | null;
  draft: { title?: string; description?: string; price?: number; images?: string[] } | null;
};

export default function ModerationProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductModeration[] | null>(null);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function load() {
    try {
      setProducts(await readData(b2b.get<ApiResponse<ProductModeration[]>>("/api/moderation/products")));
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        router.replace("/moderation/login");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить товары");
      setProducts([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function accept(id: string) {
    setPendingId(id);
    try {
      await readData(b2b.post<ApiResponse<unknown>>(`/api/moderation/products/${id}/accept`));
      toast.success("Товар принят");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось принять товар");
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
        b2b.post<ApiResponse<unknown>>(`/api/moderation/products/${id}/reject`, { reason: text })
      );
      toast.success("Товар отклонён");
      setReasonFor(null);
      setReason("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отклонить товар");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <Link href="/moderation" className="text-muted-foreground w-fit text-sm hover:underline">
        К разделам
      </Link>
      <h1 className="text-2xl font-semibold">Товары</h1>
      {products === null ? (
        <p className="text-muted-foreground text-sm">Загрузка...</p>
      ) : products.length === 0 ? (
        <p className="text-muted-foreground text-sm">Нет товаров на рассмотрении.</p>
      ) : (
        products.map((item) => (
          <section key={item.id} className="bg-card flex flex-col gap-3 rounded-xl border p-4">
            <h2 className="font-medium">
              {item.moderationStatus === "pending" ? "Новый товар" : "Изменение товара"}: {item.title}
            </h2>
            <p className="text-sm">{item.price} ₽</p>
            {item.draftStatus === "pending" && item.draft && (
              <p className="text-sm">
                {item.title} → {item.draft.title || item.title}, {item.price} ₽ →{" "}
                {item.draft.price ?? item.price} ₽
              </p>
            )}
            <p className="text-muted-foreground text-sm whitespace-pre-line">
              {item.draft?.description || item.description || "Без описания"}
            </p>
            <div className="flex gap-2">
              {(item.draft?.images || item.images).slice(0, 3).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="h-16 w-16 rounded-md object-cover" />
              ))}
            </div>
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
