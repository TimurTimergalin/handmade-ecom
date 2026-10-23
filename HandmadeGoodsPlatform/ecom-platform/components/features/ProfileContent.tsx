"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { LogOut, ShoppingBag, Store } from "lucide-react";

import { CDEK_PHONE_HINT } from "@/components/features/DeliveryBlock";
import { useAuthStore } from "@/store/auth";
import { getSellerApplication, uploadApplicationAvatar } from "@/services/api";
import { ROUTES } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";

const emptyShopForm = {
  displayName: "",
  bio: "",
  legalType: "person" as "person" | "company",
  lastName: "",
  firstName: "",
  patronymic: "",
  legalName: "",
  inn: "",
  ogrn: "",
  legalAddress: "",
};

function shopUsername(user: { id: string; username: string }): string {
  const raw = user.username.trim().toLowerCase();
  if (/^[a-z][a-z0-9_]{2,31}$/.test(raw)) return raw;
  return `shop_${user.id.replace(/-/g, "").slice(0, 8)}`;
}
const emptySubscribe = () => () => {};

export function ProfileContent({ orderCount }: { orderCount: number }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const logout = useAuthStore((s) => s.logout);
  const becomeSeller = useAuthStore((s) => s.becomeSeller);

  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [isOpeningShop, setIsOpeningShop] = useState(false);
  const [isSubmittingShop, setIsSubmittingShop] = useState(false);
  const [shopForm, setShopForm] = useState(emptyShopForm);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [application, setApplication] = useState<{
    status: "pending" | "rejected" | "active" | null;
    rejectionReason: string | null;
  } | null>(null);

  // Используем useEffect для безопасного редиректа на логин
  useEffect(() => {
    if (isMounted && ready && !user) {
      router.push(ROUTES.login);
    }
  }, [isMounted, ready, user, router]);

  useEffect(() => {
    if (!user || user.roles.includes("seller")) {
      setApplication(null);
      return;
    }
    let ignore = false;
    getSellerApplication()
      .then((next) => {
        if (!ignore) setApplication(next);
      })
      .catch(() => {
        if (!ignore) setApplication({ status: null, rejectionReason: null });
      });
    return () => {
      ignore = true;
    };
  }, [user]);

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

  async function handleLogout() {
    try {
      await logout();
      router.push(ROUTES.home);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось выйти");
    }
  }

  function handleBecomeSeller() {
    setShopForm({ ...emptyShopForm, displayName: user!.displayName, bio: user!.bio ?? "" });
    setIsOpeningShop(true);
  }

  async function handleOpenShop() {
    if (!shopForm.displayName.trim()) {
      toast.error("Укажите название магазина");
      return;
    }
    const inn = shopForm.inn.replace(/\D/g, "");
    if (shopForm.legalType === "person") {
      if (!shopForm.lastName.trim() || !shopForm.firstName.trim()) {
        toast.error("Укажите фамилию и имя");
        return;
      }
      if (!/^\d{12}$/.test(inn)) {
        toast.error("ИНН физического лица — 12 цифр");
        return;
      }
      if (shopForm.ogrn.trim() && !/^\d{15}$/.test(shopForm.ogrn.trim())) {
        toast.error("ОГРНИП — 15 цифр");
        return;
      }
    } else {
      if (!shopForm.legalName.trim()) {
        toast.error("Укажите полное наименование");
        return;
      }
      if (!/^\d{10}$/.test(inn)) {
        toast.error("ИНН юридического лица — 10 цифр");
        return;
      }
      if (!/^\d{13}$/.test(shopForm.ogrn.trim())) {
        toast.error("ОГРН — 13 цифр");
        return;
      }
      if (!shopForm.legalAddress.trim()) {
        toast.error("Укажите адрес места нахождения");
        return;
      }
    }

    setIsSubmittingShop(true);
    try {
      await becomeSeller({
        username: shopUsername(user!),
        displayName: shopForm.displayName.trim(),
        bio: shopForm.bio.trim(),
        legalType: shopForm.legalType,
        lastName: shopForm.lastName.trim(),
        firstName: shopForm.firstName.trim(),
        patronymic: shopForm.patronymic.trim(),
        legalName: shopForm.legalName.trim(),
        inn,
        ogrn: shopForm.ogrn.trim(),
        legalAddress: shopForm.legalAddress.trim(),
      });
      if (avatarFile) {
        try {
          await uploadApplicationAvatar(avatarFile);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? `Заявка отправлена, но фото не загрузилось: ${error.message}`
              : "Заявка отправлена, но фото не загрузилось"
          );
        }
      }
      toast.success("Заявка отправлена");
      setApplication({ status: "pending", rejectionReason: null });
      setIsOpeningShop(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось открыть магазин");
    } finally {
      setIsSubmittingShop(false);
    }
  }

  return (
    <div className="container mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      {/* Хедер профиля */}
      <div className="bg-card flex flex-col items-start gap-3 rounded-xl border p-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{user.displayName}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span>@{user.username}</span>
            {isSeller && (
              <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                Продавец
              </span>
            )}
          </div>

          {user.bio && <p className="mt-3 text-sm whitespace-pre-line">{user.bio}</p>}

          <div className="text-muted-foreground mt-3 text-xs">
            {user.email} · на платформе {timeAgo(user.createdAt)}
          </div>

          {user.phone?.trim() ? (
            <p className="mt-3 text-sm">{user.phone}</p>
          ) : (
            <p className="mt-3 text-sm text-orange-600">
              {CDEK_PHONE_HINT}. Укажите номер в{" "}
              <a
                href="https://id.yandex.ru/"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                профиле Яндекс ID
              </a>{" "}
              и войдите заново.
            </p>
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
        ) : application?.status === "pending" ? (
          <div className="bg-card flex items-center gap-3 rounded-xl border p-4">
            <Store className="text-muted-foreground h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">Ваша заявка обрабатывается</div>
            </div>
          </div>
        ) : isOpeningShop ? (
          <div className="bg-card flex flex-col gap-3 rounded-xl border p-4 sm:col-span-2">
            <div className="text-primary font-medium">Стать продавцом</div>
            {application?.status === "rejected" && application.rejectionReason && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {application.rejectionReason}
              </div>
            )}
            <Field
              label="Название магазина"
              value={shopForm.displayName}
              onChange={(v) => setShopForm((current) => ({ ...current, displayName: v }))}
            />
            <div className="flex flex-col gap-2">
              <span className="text-muted-foreground text-xs">Аватар магазина</span>
              {avatarPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="" className="h-16 w-16 rounded-full object-cover" />
              )}
              <label className="hover:bg-muted w-fit cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = "";
                    setAvatarFile(file);
                    setAvatarPreview(file ? URL.createObjectURL(file) : null);
                  }}
                />
                {avatarFile ? "Выбрать другое фото" : "Загрузить фото"}
              </label>
            </div>
            <Field
              label="О магазине"
              value={shopForm.bio}
              onChange={(v) => setShopForm((current) => ({ ...current, bio: v }))}
              multiline
            />
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Кто продаёт</span>
              <div className="flex gap-2">
                <TypeButton
                  active={shopForm.legalType === "person"}
                  onClick={() => setShopForm((current) => ({ ...current, legalType: "person" }))}
                  label="Физлицо"
                />
                <TypeButton
                  active={shopForm.legalType === "company"}
                  onClick={() => setShopForm((current) => ({ ...current, legalType: "company" }))}
                  label="Юрлицо"
                />
              </div>
            </div>
            {shopForm.legalType === "person" ? (
              <>
                <Field
                  label="Фамилия"
                  value={shopForm.lastName}
                  onChange={(v) => setShopForm((current) => ({ ...current, lastName: v }))}
                />
                <Field
                  label="Имя"
                  value={shopForm.firstName}
                  onChange={(v) => setShopForm((current) => ({ ...current, firstName: v }))}
                />
                <Field
                  label="Отчество, если есть"
                  value={shopForm.patronymic}
                  onChange={(v) => setShopForm((current) => ({ ...current, patronymic: v }))}
                />
                <Field
                  label="ИНН"
                  value={shopForm.inn}
                  onChange={(v) => setShopForm((current) => ({ ...current, inn: v.replace(/\D/g, "").slice(0, 12) }))}
                  placeholder="12 цифр"
                />
                <Field
                  label="ОГРНИП, если вы ИП"
                  value={shopForm.ogrn}
                  onChange={(v) => setShopForm((current) => ({ ...current, ogrn: v.replace(/\D/g, "").slice(0, 15) }))}
                  placeholder="15 цифр"
                />
              </>
            ) : (
              <>
                <Field
                  label="Полное наименование"
                  value={shopForm.legalName}
                  onChange={(v) => setShopForm((current) => ({ ...current, legalName: v }))}
                  placeholder="ООО «Мастерская»"
                />
                <Field
                  label="ИНН"
                  value={shopForm.inn}
                  onChange={(v) => setShopForm((current) => ({ ...current, inn: v.replace(/\D/g, "").slice(0, 10) }))}
                  placeholder="10 цифр"
                />
                <Field
                  label="ОГРН"
                  value={shopForm.ogrn}
                  onChange={(v) => setShopForm((current) => ({ ...current, ogrn: v.replace(/\D/g, "").slice(0, 13) }))}
                  placeholder="13 цифр"
                />
                <Field
                  label="Адрес места нахождения"
                  value={shopForm.legalAddress}
                  onChange={(v) => setShopForm((current) => ({ ...current, legalAddress: v }))}
                  placeholder="Юридический адрес, не пункт выдачи"
                />
              </>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleOpenShop}
                disabled={isSubmittingShop}
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {isSubmittingShop ? "Отправляем..." : "Отправить заявку"}
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
              {application?.status === "rejected" ? (
                <div className="text-xs text-red-600">Заявка была отклонена</div>
              ) : (
                <div className="text-muted-foreground text-xs">Откройте свой магазин на платформе</div>
              )}
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

function TypeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium"
          : "hover:bg-muted rounded-lg border px-3 py-2 text-sm font-medium"
      }
    >
      {label}
    </button>
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
