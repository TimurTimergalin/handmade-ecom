"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { b2b, HttpError, readData } from "@/lib/axios";
import type { ApiResponse } from "@/types";

type ShopApplication = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  legalType: "person" | "company" | null;
  lastName: string | null;
  firstName: string | null;
  patronymic: string | null;
  legalName: string | null;
  inn: string | null;
  ogrn: string | null;
  legalAddress: string | null;
  avatar?: string | null;
};

export default function ModerationShopsPage() {
  const router = useRouter();
  const [shops, setShops] = useState<ShopApplication[] | null>(null);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function load() {
    try {
      setShops(await readData(b2b.get<ApiResponse<ShopApplication[]>>("/api/moderation/shops")));
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        router.replace("/moderation/login");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить заявки");
      setShops([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function accept(id: string) {
    setPendingId(id);
    try {
      await readData(b2b.post<ApiResponse<unknown>>(`/api/moderation/shops/${id}/accept`));
      toast.success("Магазин принят");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось принять заявку");
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
        b2b.post<ApiResponse<unknown>>(`/api/moderation/shops/${id}/reject`, { reason: text })
      );
      toast.success("Заявка отклонена");
      setReasonFor(null);
      setReason("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отклонить заявку");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <Link href="/moderation" className="text-muted-foreground w-fit text-sm hover:underline">
        К разделам
      </Link>
      <h1 className="text-2xl font-semibold">Новые магазины</h1>
      {shops === null ? (
        <p className="text-muted-foreground text-sm">Загрузка...</p>
      ) : shops.length === 0 ? (
        <p className="text-muted-foreground text-sm">Нет заявок на рассмотрении.</p>
      ) : (
        shops.map((shop) => {
          const person = [shop.lastName, shop.firstName, shop.patronymic].filter(Boolean).join(" ");
          return (
            <section key={shop.id} className="bg-card flex flex-col gap-3 rounded-xl border p-4">
              <div>
                <h2 className="font-medium">{shop.displayName}</h2>
                <p className="text-muted-foreground text-sm">@{shop.username}</p>
              </div>
              {shop.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shop.avatar} alt="" className="h-16 w-16 rounded-full object-cover" />
              )}
              {shop.bio && <p className="text-sm">{shop.bio}</p>}
              <p className="text-sm">
                {shop.legalType === "company" ? shop.legalName : person}
                {shop.inn ? ` · ИНН ${shop.inn}` : ""}
                {shop.ogrn ? ` · ${shop.legalType === "company" ? "ОГРН" : "ОГРНИП"} ${shop.ogrn}` : ""}
              </p>
              {shop.legalAddress && <p className="text-sm">{shop.legalAddress}</p>}
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
          );
        })
      )}
    </main>
  );
}
