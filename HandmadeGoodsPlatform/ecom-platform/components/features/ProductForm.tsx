"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import { createProduct, getSellerSubscription, updateProduct, uploadImage } from "@/services/api";
import { ROUTES, DELIVERY_LABELS, SALE_MODE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DeliveryMethod, PickupPoint, Product, SaleMode } from "@/types";

interface FormState {
  title: string;
  description: string;
  image: string;
  price: string;
  inStock: string;
  saleMode: SaleMode;
  availableDeliveries: DeliveryMethod[];
  pickupPoints: PickupPoint[];
  dealContacts: string;
}

export function ProductForm({ initialProduct }: { initialProduct?: Product }) {
  const router = useRouter();
  const isEdit = !!initialProduct;

  const [form, setForm] = useState<FormState>(() => ({
    title: initialProduct?.title ?? "",
    description: initialProduct?.description ?? "",
    image: initialProduct?.image ?? "",
    price: initialProduct?.price.toString() ?? "",
    inStock: initialProduct?.inStock.toString() ?? "0",
    saleMode: initialProduct?.saleMode ?? "online",
    availableDeliveries: initialProduct?.availableDeliveries ?? ["cdek"],
    pickupPoints: initialProduct?.pickupPoints ?? [],
    dealContacts: initialProduct?.dealContacts ?? "",
  }));

  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [tier, setTier] = useState<string | null>(null);
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

  function addPickupPoint() {
    setForm((f) => ({
      ...f,
      pickupPoints: [...f.pickupPoints, { city: "", address: "" }],
    }));
  }

  function updatePickupPoint(idx: number, patch: Partial<PickupPoint>) {
    setForm((f) => ({
      ...f,
      pickupPoints: f.pickupPoints.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  }

  function removePickupPoint(idx: number) {
    setForm((f) => ({
      ...f,
      pickupPoints: f.pickupPoints.filter((_, i) => i !== idx),
    }));
  }

  function validate(): string | null {
    if (!form.title.trim()) return "Введите название";
    if (!form.image.trim()) return "Укажите URL картинки";
    const price = Number(form.price);
    if (!Number.isInteger(price) || price <= 0) return "Цена должна быть целым числом рублей";
    const stock = Number(form.inStock);
    if (!Number.isInteger(stock) || stock < 0) return "Некорректный сток";
    if (onlineLocked && form.saleMode === "online") {
      return "На тарифе Free доступны только продажи по договорённости";
    }
    if (form.saleMode === "online" && stock <= 0) return "Для продажи онлайн укажите остаток";
    if (form.availableDeliveries.length === 0) return "Выберите хотя бы один способ доставки";
    if (form.availableDeliveries.includes("pickup") && form.pickupPoints.length === 0) {
      return "Добавьте адрес самовывоза";
    }
    if (
      form.availableDeliveries.includes("pickup") &&
      form.pickupPoints.some((p) => !p.city.trim() || !p.address.trim())
    ) {
      return "Заполните все адреса самовывоза";
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

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      image: form.image.trim(),
      price: Number(form.price),
      inStock: Number(form.inStock),
      saleMode: form.saleMode,
      availableDeliveries: form.availableDeliveries,
      pickupPoints: form.availableDeliveries.includes("pickup")
        ? form.pickupPoints.map((point) => ({
            city: point.city.trim(),
            address: point.address.trim(),
          }))
        : [],
      dealContacts: form.dealContacts.trim(),
    };

    try {
      if (isEdit && initialProduct) {
        await updateProduct(initialProduct.id, payload);
        toast.success("Товар обновлён");
      } else {
        await createProduct(payload);
        toast.success("Товар создан");
      }
      router.push(ROUTES.seller.products);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить товар");
      setIsSaving(false);
    }
  }

  async function handleImageFile(file: File | undefined) {
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadImage(file);
      update("image", url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить изображение");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">Основное</h2>
        <Field label="Название" value={form.title} onChange={(v) => update("title", v)} />
        <Field
          label="Описание"
          value={form.description}
          onChange={(v) => update("description", v)}
          multiline
        />
        <Field
          label="URL картинки"
          value={form.image}
          onChange={(v) => update("image", v)}
          placeholder="https://..."
        />
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
          <input
            type="file"
            accept="image/*"
            disabled={isUploading}
            className="text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void handleImageFile(file);
            }}
          />
          {isUploading ? "Загрузка..." : "или загрузите файл"}
        </label>
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
          {(["online", "out_of_stock", "deal_only"] as SaleMode[]).map((mode) => {
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
        {onlineLocked && (
          <p className="text-muted-foreground text-xs">
            Тариф Free: режим «В наличии» недоступен, только продажи по договорённости.
          </p>
        )}

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
            <div className="text-muted-foreground text-xs">Адреса самовывоза</div>
            {form.pickupPoints.map((point, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <input
                  value={point.city}
                  onChange={(e) => updatePickupPoint(idx, { city: e.target.value })}
                  placeholder="Город"
                  className="bg-background w-32 rounded-md border px-3 py-2 text-sm outline-none"
                />
                <input
                  value={point.address}
                  onChange={(e) => updatePickupPoint(idx, { address: e.target.value })}
                  placeholder="Адрес"
                  className="bg-background flex-1 rounded-md border px-3 py-2 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => removePickupPoint(idx)}
                  className="hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-md p-2"
                  aria-label="Удалить адрес"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addPickupPoint}
              className="text-primary flex items-center gap-1.5 self-start text-xs hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить адрес
            </button>
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
