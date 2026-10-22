"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { LogOut, ShoppingBag, Store, Pencil } from "lucide-react";

import { useAuthStore } from "@/store/auth";
import { ROUTES } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";

const emptySubscribe = () => () => {};
const AVATAR_FALLBACK = "https://ui-avatars.com/api/?name=U&background=6b7280&color=fff&size=150";

export function ProfileContent({ orderCount }: { orderCount: number }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const logout = useAuthStore((s) => s.logout);
  const becomeSeller = useAuthStore((s) => s.becomeSeller);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    bio: "",
    avatar: "",
  });
  const [isOpeningShop, setIsOpeningShop] = useState(false);
  const [isSubmittingShop, setIsSubmittingShop] = useState(false);
  const [shopForm, setShopForm] = useState({ username: "", displayName: "", bio: "" });

  // Используем useEffect для безопасного редиректа на логин
  useEffect(() => {
    if (isMounted && ready && !user) {
      router.push(ROUTES.login);
    }
  }, [isMounted, ready, user, router]);

  if (!isMounted) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <div className="text-muted-foreground animate-pulse">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    return null; // пока произойдет редирект
  }

  const isSeller = user.roles.includes("seller");

  function handleEditStart() {
    setForm({
      displayName: user!.displayName,
      bio: user!.bio ?? "",
      avatar: user!.avatar,
    });
    setIsEditing(true);
  }

  async function handleSave() {
    if (!form.displayName.trim()) {
      toast.error("Имя не может быть пустым");
      return;
    }
    try {
      await updateProfile({
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
        avatar: form.avatar.trim() || user!.avatar,
      });
      setIsEditing(false);
      toast.success("Профиль обновлён");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось обновить профиль");
    }
  }

  async function handleLogout() {
    try {
      await logout();
      router.push(ROUTES.home);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось выйти");
    }
  }

  function handleBecomeSeller() {
    setShopForm({ username: "", displayName: user!.displayName, bio: user!.bio ?? "" });
    setIsOpeningShop(true);
  }

  async function handleOpenShop() {
    const username = shopForm.username.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,31}$/.test(username)) {
      toast.error("Адрес магазина: латиница, цифры и _, 3–32 символа, с буквы");
      return;
    }
    if (!shopForm.displayName.trim()) {
      toast.error("Укажите имя магазина");
      return;
    }

    setIsSubmittingShop(true);
    try {
      await becomeSeller({
        username,
        displayName: shopForm.displayName.trim(),
        bio: shopForm.bio.trim(),
      });
      toast.success("Поздравляем! Теперь вы продавец.");
      router.push(ROUTES.seller.onboarding);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось открыть магазин");
    } finally {
      setIsSubmittingShop(false);
    }
  }

  return (
    <div className="container mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      {/* Хедер профиля */}
      <div className="bg-card flex flex-col items-start gap-6 rounded-xl border p-6 sm:flex-row">
        <div className="bg-muted relative h-24 w-24 shrink-0 overflow-hidden rounded-full">
          <Image
            src={(isEditing ? form.avatar || user.avatar : user.avatar) || AVATAR_FALLBACK}
            alt={user.displayName}
            fill
            sizes="96px"
            className="object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex flex-col gap-3">
              <Field
                label="Имя"
                value={form.displayName}
                onChange={(v) => setForm((f) => ({ ...f, displayName: v }))}
              />
              <Field
                label="URL аватара"
                value={form.avatar}
                onChange={(v) => setForm((f) => ({ ...f, avatar: v }))}
                placeholder="https://..."
              />
              <Field
                label="О себе"
                value={form.bio}
                onChange={(v) => setForm((f) => ({ ...f, bio: v }))}
                multiline
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-bold">{user.displayName}</h1>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                    <span>@{user.username}</span>
                    {isSeller && (
                      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                        Продавец
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleEditStart}
                  className="hover:bg-muted flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Редактировать
                </button>
              </div>

              {user.bio && <p className="mt-3 text-sm whitespace-pre-line">{user.bio}</p>}

              <div className="text-muted-foreground mt-3 text-xs">
                {user.email} · на платформе {timeAgo(user.createdAt)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Действия */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href={ROUTES.orders}
          className="bg-card flex items-center gap-3 rounded-xl border p-4 transition-shadow hover:shadow-md"
        >
          <ShoppingBag className="text-muted-foreground h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">Мои заказы</div>
            <div className="text-muted-foreground text-xs">
              {orderCount > 0
                ? `${orderCount} ${orderCount === 1 ? "заказ" : "заказов"}`
                : "Пока нет заказов"}
            </div>
          </div>
        </Link>

        {isSeller ? (
          <Link
            href={ROUTES.seller.dashboard}
            className="bg-card flex items-center gap-3 rounded-xl border p-4 transition-shadow hover:shadow-md"
          >
            <Store className="text-muted-foreground h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">Кабинет продавца</div>
              <div className="text-muted-foreground text-xs">Товары, заказы, публикации</div>
            </div>
          </Link>
        ) : isOpeningShop ? (
          <div className="bg-card flex flex-col gap-3 rounded-xl border p-4 sm:col-span-2">
            <div className="text-primary font-medium">Стать продавцом</div>
            <Field
              label="Адрес магазина"
              value={shopForm.username}
              onChange={(v) => setShopForm((current) => ({ ...current, username: v }))}
              placeholder="anna_ceramics"
            />
            <Field
              label="Имя магазина"
              value={shopForm.displayName}
              onChange={(v) => setShopForm((current) => ({ ...current, displayName: v }))}
            />
            <Field
              label="О магазине"
              value={shopForm.bio}
              onChange={(v) => setShopForm((current) => ({ ...current, bio: v }))}
              multiline
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleOpenShop}
                disabled={isSubmittingShop}
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {isSubmittingShop ? "Открываем..." : "Открыть магазин"}
              </button>
              <button
                type="button"
                onClick={() => setIsOpeningShop(false)}
                className="hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleBecomeSeller}
            className="bg-card flex items-center gap-3 rounded-xl border p-4 text-left transition-shadow hover:shadow-md"
          >
            <Store className="text-primary h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <div className="text-primary font-medium">Стать продавцом</div>
              <div className="text-muted-foreground text-xs">
                Откройте свой магазин на платформе
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Выход */}
      <button
        type="button"
        onClick={handleLogout}
        className="bg-card text-destructive flex items-center gap-3 rounded-xl border p-4 text-left transition-shadow hover:shadow-md"
      >
        <LogOut className="h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">Выйти</div>
          <div className="text-muted-foreground text-xs">Завершить сессию на этом устройстве</div>
        </div>
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const cls =
    "rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 w-full";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={cls}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </label>
  );
}
