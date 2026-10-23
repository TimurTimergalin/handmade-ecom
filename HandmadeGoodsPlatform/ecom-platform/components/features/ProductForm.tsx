"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { X } from "lucide-react";

import { createProduct, getDeliverySettings, getSellerSubscription, revertProduct, updateProduct, uploadImage } from "@/services/api";
import { ROUTES, DELIVERY_LABELS, SALE_MODE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DeliveryMethod, PickupPoint, Product, SaleMode } from "@/types";

function pointKey(point: PickupPoint) {
  return `${point.city.trim()}__${point.address.trim()}`;
}

interface FormState {
  title: string;
  description: string;
  images: string[];
  price: string;
  inStock: string;
  saleMode: SaleMode;
  availableDeliveries: DeliveryMethod[];
  pickupPoints: PickupPoint[];
  dealContacts: string;
}

function initialImages(product?: Product): string[] {
  const listed = (product?.images ?? []).map((url) => url.trim()).filter(Boolean);
  if (listed.length > 0) return listed;
  const single = product?.image.trim();
  return single ? [single] : [];
}

function formSource(product?: Product): Product | undefined {
  if (!product?.draftStatus || !product.draft) return product;
  return { ...product, ...product.draft };
}

export function ProductForm({ initialProduct }: { initialProduct?: Product }) {
  const router = useRouter();
  const isEdit = !!initialProduct;
  const source = formSource(initialProduct);

  const [form, setForm] = useState<FormState>(() => ({
    title: source?.title ?? "",
    description: source?.description ?? "",
    images: initialImages(source),
    price: source?.price.toString() ?? "",
    inStock: source?.inStock.toString() ?? "0",
    saleMode: source?.saleMode === "deal_only" ? "deal_only" : "online",
    availableDeliveries: source?.availableDeliveries ?? ["cdek"],
    pickupPoints: source?.pickupPoints ?? [],
    dealContacts: source?.dealContacts ?? "",
  }));

  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [tier, setTier] = useState<string | null>(null);
  const [shopPickupPoints, setShopPickupPoints] = useState<PickupPoint[]>([]);
  const onlineLocked = tier === "free" && initialProduct?.saleMode !== "online";

  useEffect(() => {
    let cancelled = false;
    getSellerSubscription()
      .then((subscription) => {
        if (cancelled) return;
        setTier(subscription.tier);
        if (subscription.tier === "free" && initialProduct?.saleMode !== "online") {
          setForm((current) =>
            current.saleMode === "online" ? { ...current, saleMode: "deal_only" } : current
          );
        }
      })
      .catch(() => {
        if (!cancelled) setTier(null);
      });
    getDeliverySettings()
      .then((settings) => {
        if (cancelled) return;
        const points = settings.pickupEnabled ? (settings.pickupPoints ?? []) : [];
        setShopPickupPoints(points);
        setForm((current) => ({
          ...current,
          pickupPoints: current.pickupPoints.flatMap((item) => {
            const match = points.find((point) => pointKey(point) === pointKey(item));
            return match ? [match] : [];
          }),
        }));
      })
      .catch(() => {
        if (!cancelled) setShopPickupPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [initialProduct?.saleMode]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleDelivery(d: DeliveryMethod) {
    setForm((f) => {
      const has = f.availableDeliveries.includes(d);
      return {
        ...f,
        availableDeliveries: has
          ? f.availableDeliveries.filter((x) => x !== d)
          : [...f.availableDeliveries, d],
      };
    });
  }

  function toggleShopPoint(point: PickupPoint) {
    setForm((current) => {
      const key = pointKey(point);
      const selected = current.pickupPoints.some((item) => pointKey(item) === key);
      return {
        ...current,
        pickupPoints: selected
          ? current.pickupPoints.filter((item) => pointKey(item) !== key)
          : [...current.pickupPoints, point],
      };
    });
  }

  function imageList(): string[] {
    return form.images.map((url) => url.trim()).filter(Boolean);
  }

  function validate(): string | null {
    if (!form.title.trim()) return "Введите название";
    if (imageList().length < 2) return "Добавьте минимум две картинки";
    const price = Number(form.price);
    if (!Number.isInteger(price) || price <= 0) return "Цена должна быть целым числом рублей";
    const stock = Number(form.inStock);
    if (!Number.isInteger(stock) || stock < 0) return "Некорректный сток";
    if (onlineLocked && form.saleMode === "online") {
      return "На тарифе Free доступны только продажи по договорённости";
    }
    if (form.availableDeliveries.length === 0) return "Выберите хотя бы один способ доставки";
    if (form.availableDeliveries.includes("pickup") && form.pickupPoints.length === 0) {
      return shopPickupPoints.length === 0
        ? "Сначала добавьте пункты самовывоза в разделе «Доставка»"
        : "Выберите пункт самовывоза";
    }
    if (form.saleMode === "deal_only" && !form.dealContacts.trim()) {
      return "Укажите контакты для сделки";
    }
    return null;
  }

  async function handleSave() {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setIsSaving(true);

    const images = imageList();
    const image = images[0];
    if (!image) {
      toast.error("Добавьте минимум две картинки");
      setIsSaving(false);
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      image,
      images,
      price: Number(form.price),
      inStock: Number(form.inStock),
      saleMode: form.saleMode,
      availableDeliveries: form.availableDeliveries,
      pickupPoints: form.availableDeliveries.includes("pickup")
        ? form.pickupPoints.map((point) => ({
            city: point.city.trim(),
            address: point.address.trim(),
            maxDays: point.maxDays as number,
          }))
        : [],
      dealContacts: form.dealContacts.trim(),
    };

    try {
      if (isEdit && initialProduct) {
        await updateProduct(initialProduct.id, payload);
        const contentChanged =
          payload.title !== (source?.title ?? "").trim() ||
          payload.description !== (source?.description ?? "").trim() ||
          payload.price !== source?.price ||
          payload.images.join("\n") !== initialImages(source).join("\n");
        toast.success(
          initialProduct.moderationStatus === "active" && !contentChanged
            ? "Товар обновлён"
            : initialProduct.moderationStatus === "active"
              ? "Изменения товара отправлены на модерацию"
              : "Товар отправлен на модерацию"
        );
      } else {
        await createProduct(payload);
        toast.success("Товар отправлен на модерацию");
      }
      router.push(ROUTES.seller.products);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить товар");
      setIsSaving(false);
    }
  }

  async function handleImageFiles(files: File[]) {
    if (files.length === 0) return;
    setIsUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        uploaded.push(await uploadImage(file));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить изображение");
    } finally {
      if (uploaded.length > 0) {
        setForm((current) => ({ ...current, images: [...current.images, ...uploaded] }));
      }
      setIsUploading(false);
    }
  }

  function removeImage(index: number) {
    setForm((current) => ({
      ...current,
      images: current.images.filter((_, imageIndex) => imageIndex !== index),
    }));
  }

  async function rollbackDraft() {
    if (!initialProduct) return;
    setIsSaving(true);
    try {
      await revertProduct(initialProduct.id);
      toast.success("Изменения отменены");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось откатить изменения");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {initialProduct?.moderationStatus === "pending" && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Товар на модерации и пока не показан на витрине.
        </div>
      )}
      {initialProduct?.moderationStatus === "rejected" && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Заявка отклонена{initialProduct.rejectionReason ? `: ${initialProduct.rejectionReason}` : ""}.
          Исправьте товар и отправьте снова.
        </div>
      )}
      {initialProduct?.draftStatus === "pending" && (
        <div className="flex flex-col gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p>Изменения на модерации. На витрине пока прежние данные.</p>
          <button
            type="button"
            onClick={() => void rollbackDraft()}
            disabled={isSaving}
            className="w-fit rounded-md border border-amber-800 px-3 py-1 text-xs font-medium disabled:opacity-60"
          >
            Откатить изменения
          </button>
        </div>
      )}
      {initialProduct?.draftStatus === "rejected" && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Изменения отклонены
          {initialProduct.rejectionReason ? `: ${initialProduct.rejectionReason}` : ""}.
        </div>
      )}
      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">Основное</h2>
        <Field label="Название" value={form.title} onChange={(v) => update("title", v)} />
        <Field
          label="Описание"
          value={form.description}
          onChange={(v) => update("description", v)}
          multiline
        />
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs">Фотографии</span>
          {form.images.length > 0 && (
            <ul className="flex flex-col gap-2">
              {form.images.map((url, index) => (
                <li key={`${url}-${index}`} className="flex items-center gap-3">
                  <div className="bg-muted relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
                    {/* Превью файла из хранилища */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </div>
                  <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                    {index + 1}. {url}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-md p-2"
                    aria-label="Удалить фото"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground text-xs">
            {form.images.length < 2
              ? "Добавьте минимум две картинки. На карточке они идут в этом порядке."
              : "На карточке товара фото идут в этом порядке."}
          </p>
          <label
            className={`hover:bg-muted w-fit cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium ${isUploading ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={isUploading}
              className="sr-only"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void handleImageFiles(files);
              }}
            />
            {isUploading ? "Загрузка..." : "Загрузить фото"}
          </label>
        </div>
      </section>

      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">Цена и сток</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Цена, ₽"
            type="number"
            value={form.price}
            onChange={(v) => update("price", v)}
          />
          <Field
            label="В наличии, шт."
            type="number"
            value={form.inStock}
            onChange={(v) => update("inStock", v)}
          />
        </div>
      </section>

      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">Режим продажи</h2>
        <div className="flex flex-col gap-2">
          {(["online", "deal_only"] as SaleMode[]).map((mode) => {
            const disabled = mode === "online" && onlineLocked;
            return (
              <label
                key={mode}
                className={cn(
                  "flex items-center gap-3",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                )}
              >
                <input
                  type="radio"
                  name="saleMode"
                  checked={form.saleMode === mode}
                  disabled={disabled}
                  onChange={() => update("saleMode", mode)}
                />
                <span className="text-sm">{SALE_MODE_LABELS[mode]}</span>
              </label>
            );
          })}
        </div>
        <p className="text-muted-foreground text-xs">
          {onlineLocked
            ? "Тариф Free: режим «В наличии» недоступен, только продажи по договорённости."
            : "Нет в наличии — это нулевой остаток, отдельный режим для этого не нужен."}
        </p>

        {form.saleMode === "deal_only" && (
          <Field
            label="Контакты для сделки"
            value={form.dealContacts}
            onChange={(v) => update("dealContacts", v)}
            placeholder="Telegram: @username, телефон: +7..."
            multiline
          />
        )}
      </section>

      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">Доставка</h2>
        <div className="flex flex-col gap-2">
          {(["pickup", "cdek"] as DeliveryMethod[]).map((d) => (
            <label key={d} className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={form.availableDeliveries.includes(d)}
                onChange={() => toggleDelivery(d)}
              />
              <span className="text-sm">{DELIVERY_LABELS[d]}</span>
            </label>
          ))}
        </div>

        {form.availableDeliveries.includes("pickup") && (
          <div className="flex flex-col gap-2 border-t pt-2">
            <div className="text-muted-foreground text-xs">Пункты самовывоза</div>
            {shopPickupPoints.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                В разделе «Доставка» ещё нет пунктов самовывоза.{" "}
                <Link href={ROUTES.seller.delivery} className="text-primary hover:underline">
                  Настроить
                </Link>
              </p>
            ) : (
              shopPickupPoints.map((point) => {
                const selected = form.pickupPoints.some((item) => pointKey(item) === pointKey(point));
                return (
                  <label key={pointKey(point)} className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected}
                      onChange={() => toggleShopPoint(point)}
                    />
                    <span className="text-sm">
                      {point.city}, {point.address}
                      {typeof point.maxDays === "number" ? ` · до ${point.maxDays} дн.` : ""}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            "rounded-lg px-5 py-2.5 text-sm font-medium transition-colors",
            isSaving
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {isSaving ? "Сохранение..." : isEdit ? "Сохранить" : "Создать товар"}
        </button>
        <button
          type="button"
          onClick={() => router.push(ROUTES.seller.products)}
          className="hover:bg-muted rounded-lg border px-5 py-2.5 text-sm font-medium"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
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
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </label>
  );
}
