"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";

import {
  getSellerProfile,
  getSellerSubscription,
  updateSellerProfile,
  uploadImage,
  type PayoutCard,
} from "@/services/api";
import { PayoutCardWidget } from "@/components/features/PayoutCardWidget";
import { ROUTES } from "@/lib/constants";

const AVATAR_FALLBACK = "https://ui-avatars.com/api/?name=U&size=150";

export function SellerProfileForm() {
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [username, setUsername] = useState("");
  const [payoutLinked, setPayoutLinked] = useState(false);
  const [payoutCard, setPayoutCard] = useState<PayoutCard | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const payoutRequired = tier === "premium";
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSellerProfile(), getSellerSubscription().catch(() => null)])
      .then(([profile, subscription]) => {
        if (cancelled) return;
        setDisplayName(profile.displayName ?? "");
        setBio(profile.bio ?? "");
        setAvatar(profile.avatar ?? "");
        setUsername(profile.username ?? "");
        setPayoutLinked(Boolean(profile.payoutToken));
        setPayoutCard(profile.payoutCard ?? null);
        setTier(subscription?.tier ?? null);
        setIsReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : "Не удалось загрузить профиль");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!displayName.trim()) {
      toast.error("Имя не может быть пустым");
      return;
    }
    if (payoutRequired && !payoutLinked) {
      toast.error("На тарифе Premium привяжите карту для выплат");
      return;
    }

    setIsSaving(true);
    try {
      const saved = await updateSellerProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatar: avatar.trim(),
      });
      setDisplayName(saved.displayName ?? "");
      setBio(saved.bio ?? "");
      setAvatar(saved.avatar ?? "");
      setUsername(saved.username ?? username);
      toast.success("Профиль обновлён");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить профиль");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAvatarFile(file: File | undefined) {
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadImage(file);
      setAvatar(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить изображение");
    } finally {
      setIsUploading(false);
    }
  }

  if (!isReady) {
    return <div className="text-muted-foreground text-sm">Загрузка профиля...</div>;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="bg-card flex flex-col gap-4 rounded-xl border p-4">
        <div className="flex items-center gap-4">
          <div className="bg-muted relative h-20 w-20 shrink-0 overflow-hidden rounded-full">
            <Image
              src={avatar || AVATAR_FALLBACK}
              alt={displayName}
              fill
              sizes="80px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-muted-foreground text-xs">Ссылка на витрину</div>
            <Link
              href={ROUTES.sellerPublic(username)}
              target="_blank"
              className="text-primary flex items-center gap-1 text-sm font-medium hover:underline"
            >
              /shops/{username}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Имя магазина</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Анна Керамика"
            className="bg-background focus:ring-primary/30 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">URL аватара</span>
          <input
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://..."
            className="bg-background focus:ring-primary/30 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
        </label>
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
          <input
            type="file"
            accept="image/*"
            disabled={isUploading}
            className="text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void handleAvatarFile(file);
            }}
          />
          {isUploading ? "Загрузка..." : "или загрузите файл"}
        </label>

        <PayoutCardWidget
          required={payoutRequired}
          linked={payoutLinked}
          card={payoutCard}
          onChange={({ linked, card }) => {
            setPayoutLinked(linked);
            setPayoutCard(card);
          }}
        />

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">О магазине</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Расскажите о себе и своём творчестве"
            rows={4}
            className="bg-background focus:ring-primary/30 resize-y rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
        </label>
      </section>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {isSaving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>

      <div className="bg-muted/30 rounded-xl border p-4">
        <div className="text-muted-foreground text-xs">
          <strong>@{username || "username"}</strong> — постоянный идентификатор магазина. Изменить
          его нельзя, так как он используется в публичной ссылке.
        </div>
      </div>
    </div>
  );
}
