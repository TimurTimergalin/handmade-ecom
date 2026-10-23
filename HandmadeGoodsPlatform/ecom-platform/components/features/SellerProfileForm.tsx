"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";

import { getSellerProfile, getSellerSubscription, revertSellerProfile, updateSellerProfile, uploadImage } from "@/services/api";
import { b2b, readData } from "@/lib/axios";
import { ROUTES } from "@/lib/constants";
import type { ApiResponse } from "@/types";

const AVATAR_FALLBACK = "https://ui-avatars.com/api/?name=U&size=150";

export function SellerProfileForm() {
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [uploadedAvatar, setUploadedAvatar] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [yookassaShopId, setYookassaShopId] = useState("");
  const [tier, setTier] = useState<string | null>(null);
  const shopRequired = tier === "premium";
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [profileStatus, setProfileStatus] = useState<"pending" | "rejected" | null>(null);
  const [profileReason, setProfileReason] = useState<string | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  function showProfile(profile: Awaited<ReturnType<typeof getSellerProfile>>) {
    const draft = profile.profileStatus && profile.profileDraft ? profile.profileDraft : null;
    setDisplayName(draft?.displayName ?? profile.displayName ?? "");
    setBio(draft?.bio ?? profile.bio ?? "");
    setAvatar(draft?.avatar ?? profile.avatar ?? "");
    setUsername(profile.username ?? "");
    setYookassaShopId(profile.yookassaShopId ?? "");
    setProfileStatus(profile.profileStatus ?? null);
    setProfileReason(profile.profileRejectionReason ?? null);
  }

  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get("yookassa");
    if (flag === "connected") toast.success("Магазин ЮKassa подключён");
    if (flag === "denied") toast.error("Подключение ЮKassa отменено");
    if (flag === "error") toast.error("Не удалось подключить ЮKassa");
  }, []);

  async function connectYookassa() {
    try {
      const data = await readData(b2b.get<ApiResponse<{ url: string }>>("/api/seller/yookassa/connect"));
      if (!data?.url) throw new Error("Не удалось начать подключение");
      window.location.assign(data.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось начать подключение");
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSellerProfile(), getSellerSubscription().catch(() => null)])
      .then(([profile, subscription]) => {
        if (cancelled) return;
        showProfile(profile);
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
    const shopId = yookassaShopId.trim();
    if (shopRequired && !shopId) {
      toast.error("На Premium сначала подключите магазин ЮKassa");
      return;
    }

    setIsSaving(true);
    try {
      const saved = await updateSellerProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        ...(uploadedAvatar ? { avatar: uploadedAvatar } : {}),
      });
      showProfile(saved);
      setUploadedAvatar(null);
      toast.success(
        saved.profileStatus === "pending"
          ? "Изменения профиля отправлены на модерацию"
          : "Профиль обновлён"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить профиль");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRevert() {
    setIsReverting(true);
    try {
      const saved = await revertSellerProfile();
      showProfile(saved);
      setUploadedAvatar(null);
      toast.success("Изменения отменены");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось откатить изменения");
    } finally {
      setIsReverting(false);
    }
  }

  async function handleAvatarFile(file: File | undefined) {
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadImage(file);
      setAvatar(url);
      setUploadedAvatar(url);
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
        {profileStatus === "pending" && (
          <div className="flex flex-col gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p>Изменения названия, описания и аватара на модерации. На витрине пока прежние данные.</p>
            <button
              type="button"
              onClick={handleRevert}
              disabled={isReverting}
              className="w-fit rounded-md border border-amber-800 px-3 py-1 text-xs font-medium disabled:opacity-60"
            >
              {isReverting ? "Откатываем..." : "Откатить изменения"}
            </button>
          </div>
        )}
        {profileStatus === "rejected" && profileReason && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{profileReason}</div>
        )}
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

        <label
          className={`hover:bg-muted w-fit cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium ${isUploading ? "pointer-events-none opacity-60" : ""}`}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={isUploading}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void handleAvatarFile(file);
            }}
          />
          {isUploading ? "Загрузка..." : "Загрузить фото"}
        </label>

        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <span className="text-sm font-medium">Магазин ЮKassa</span>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Подключите магазин через тестовую ЮKassa. Номер магазина выдаст заглушка после
            подтверждения.
            {shopRequired ? " На Premium подключение обязательно." : ""}
          </p>
          {yookassaShopId ? (
            <p className="text-sm">Магазин подключён: {yookassaShopId}</p>
          ) : (
            <p className="text-muted-foreground text-sm">Магазин ещё не подключён.</p>
          )}
          <button
            type="button"
            onClick={connectYookassa}
            className="hover:bg-muted w-fit rounded-lg border px-4 py-2 text-sm font-medium"
          >
            {yookassaShopId ? "Подключить другой магазин" : "Подключить ЮKassa"}
          </button>
        </div>

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
