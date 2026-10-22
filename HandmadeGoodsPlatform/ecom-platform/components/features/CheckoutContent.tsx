"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Truck } from "lucide-react";

import { createOrder } from "@/services/api";
import { useCartStore } from "@/store/cart";
import { groupCartItems, calculateTotal } from "@/lib/cart-utils";
import { ROUTES, DELIVERY_LABELS } from "@/lib/constants";
import { formatPrice, pluralize, cn } from "@/lib/utils";
import type { PickupPoint, Product } from "@/types";

interface ContactInfo {
  name: string;
  phone: string;
  email: string;
}

export function CheckoutContent({ allProducts }: { allProducts: Product[] }) {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);

  const [contact, setContact] = useState<ContactInfo>({
    name: "",
    phone: "",
    email: "",
  });

  // Для каждой группы: выбранная точка самовывоза (индекс) или адрес СДЭК
  const [pickupSelection, setPickupSelection] = useState<Record<string, number>>({});
  const [cdekAddress, setCdekAddress] = useState<Record<string, { city: string; address: string }>>(
    {}
  );

  const [isPaying, setIsPaying] = useState(false);

  const productById = new Map(allProducts.map((p) => [p.id, p]));
  const groups = groupCartItems(items, allProducts);
  const total = calculateTotal(groups, allProducts);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-muted-foreground text-lg">Корзина пуста</p>
        <Link
          href={ROUTES.home}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-2.5 text-sm font-medium"
        >
          На главную
        </Link>
      </div>
    );
  }

  const isContactValid =
    contact.name.trim().length > 0 &&
    contact.phone.trim().length > 0 &&
    contact.email.includes("@");

  const areGroupsValid = groups.every((g) => {
    if (g.items.length === 0) return true;
    if (g.delivery === "pickup") {
      return pickupSelection[g.key] !== undefined;
    }
    const addr = cdekAddress[g.key];
    return addr && addr.city.trim() && addr.address.trim();
  });

  const canPay = isContactValid && areGroupsValid && !isPaying;

  async function handlePay() {
    if (!canPay) return;

    const orderGroups = groups
      .filter((group) => group.items.length > 0)
      .map((group) => {
        const payload: {
          sellerId: string;
          delivery: typeof group.delivery;
          items: { productId: string; quantity: number }[];
          pickupPoint?: PickupPoint;
        } = {
          sellerId: group.seller.id,
          delivery: group.delivery,
          items: group.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        };

        if (group.delivery === "pickup") {
          const points = pickupPointsFor(group.key);
          const selected = points[pickupSelection[group.key] ?? -1];
          if (selected) payload.pickupPoint = selected;
        }

        if (group.delivery === "cdek") {
          const address = cdekAddress[group.key];
          if (address?.city.trim() && address.address.trim()) {
            payload.pickupPoint = {
              city: address.city.trim(),
              address: address.address.trim(),
            };
          }
        }

        return payload;
      });

    if (orderGroups.length === 0) {
      toast.error("Нет товаров, доступных к заказу");
      return;
    }

    setIsPaying(true);
    try {
      const result = await createOrder({ groups: orderGroups, contact });
      clear();
      if (typeof result.paymentUrl === "string" && opensPaymentPage(result.paymentUrl)) {
        window.location.assign(result.paymentUrl);
        return;
      }
      toast.success("Заказ оформлен");
      router.push(ROUTES.orders);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось оформить заказ");
      setIsPaying(false);
    }
  }

  function opensPaymentPage(url: string): boolean {
  if (url === "https://yoomoney.ru/checkout/demo") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") return true;
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function pickupPointsFor(groupKey: string): PickupPoint[] {
    const group = groups.find((item) => item.key === groupKey);
    if (!group) return [];
    const pickupPoints = new Map<string, PickupPoint>();
    for (const item of group.items) {
      const product = productById.get(item.productId);
      if (!product?.pickupPoints) continue;
      for (const point of product.pickupPoints) {
        pickupPoints.set(`${point.city}__${point.address}`, point);
      }
    }
    return Array.from(pickupPoints.values());
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Контактные данные */}
      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">Контактные данные</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Имя и фамилия"
            value={contact.name}
            onChange={(v) => setContact((c) => ({ ...c, name: v }))}
            placeholder="Иван Петров"
          />
          <Field
            label="Телефон"
            value={contact.phone}
            onChange={(v) => setContact((c) => ({ ...c, phone: v }))}
            placeholder="+7 999 123-45-67"
            type="tel"
          />
          <Field
            label="Email"
            value={contact.email}
            onChange={(v) => setContact((c) => ({ ...c, email: v }))}
            placeholder="you@example.com"
            type="email"
            className="sm:col-span-2"
          />
        </div>
      </section>

      {/* Группы заказов */}
      {groups.map((group) => {
        if (group.items.length === 0) return null;

        const groupTotal = group.items.reduce((sum, item) => {
          const p = productById.get(item.productId);
          return sum + (p ? p.price * item.quantity : 0);
        }, 0);

        // Все точки самовывоза в группе (у разных товаров могут быть разные)
        const pickupPoints = new Map<string, PickupPoint>();
        for (const item of group.items) {
          const p = productById.get(item.productId);
          if (p?.pickupPoints) {
            for (const point of p.pickupPoints) {
              pickupPoints.set(`${point.city}__${point.address}`, point);
            }
          }
        }
        const pointsList = Array.from(pickupPoints.values());

        return (
          <section key={group.key} className="bg-card flex flex-col gap-4 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3 border-b pb-3">
              <div className="font-medium">{group.seller.displayName}</div>
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                {group.delivery === "pickup" ? (
                  <MapPin className="h-3 w-3" />
                ) : (
                  <Truck className="h-3 w-3" />
                )}
                {DELIVERY_LABELS[group.delivery]}
              </div>
            </div>

            {/* Выбор точки самовывоза */}
            {group.delivery === "pickup" && pointsList.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">Выберите точку самовывоза</div>
                <div className="flex flex-col gap-2">
                  {pointsList.map((point, idx) => {
                    const key = `${point.city}__${point.address}`;
                    const isSelected = pickupSelection[group.key] === idx;
                    return (
                      <label
                        key={key}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                          isSelected ? "border-primary bg-primary/5" : "hover:bg-muted"
                        )}
                      >
                        <input
                          type="radio"
                          name={`pickup-${group.key}`}
                          checked={isSelected}
                          onChange={() =>
                            setPickupSelection((prev) => ({
                              ...prev,
                              [group.key]: idx,
                            }))
                          }
                          className="mt-1"
                        />
                        <div className="text-sm">
                          <div className="font-medium">{point.city}</div>
                          <div className="text-muted-foreground">{point.address}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Адрес для СДЭК */}
            {group.delivery === "cdek" && (
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">Адрес доставки</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field
                    label="Город"
                    value={cdekAddress[group.key]?.city ?? ""}
                    onChange={(v) =>
                      setCdekAddress((prev) => ({
                        ...prev,
                        [group.key]: {
                          city: v,
                          address: prev[group.key]?.address ?? "",
                        },
                      }))
                    }
                    placeholder="Москва"
                  />
                  <Field
                    label="Улица, дом, квартира"
                    value={cdekAddress[group.key]?.address ?? ""}
                    onChange={(v) =>
                      setCdekAddress((prev) => ({
                        ...prev,
                        [group.key]: {
                          city: prev[group.key]?.city ?? "",
                          address: v,
                        },
                      }))
                    }
                    placeholder="ул. Ленина, д. 5, кв. 12"
                  />
                </div>
              </div>
            )}

            {/* Состав заказа */}
            <div>
              <div className="mb-2 text-sm font-medium">Товары</div>
              <ul className="divide-y">
                {group.items.map((item) => {
                  const product = productById.get(item.productId);
                  if (!product) return null;
                  return (
                    <li
                      key={`${item.productId}__${item.delivery}`}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="truncate">
                        {product.title}
                        <span className="text-muted-foreground"> × {item.quantity}</span>
                      </span>
                      <span className="shrink-0 font-medium">
                        {formatPrice(product.price * item.quantity)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-muted-foreground text-sm">Итого у продавца</span>
              <span className="font-bold">{formatPrice(groupTotal)}</span>
            </div>
          </section>
        );
      })}

      {/* Итого + оплата */}
      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            Итого к оплате ({items.reduce((s, i) => s + i.quantity, 0)}{" "}
            {pluralize(
              items.reduce((s, i) => s + i.quantity, 0),
              ["товар", "товара", "товаров"]
            )}
            )
          </span>
          <span className="text-2xl font-bold">{formatPrice(total)}</span>
        </div>

        {!canPay && !isPaying && (
          <div className="text-muted-foreground text-xs">
            Заполните контактные данные
            {groups.some((g) => g.items.length > 0) &&
              " и выберите способ получения для каждой группы"}
          </div>
        )}

        <button
          type="button"
          onClick={handlePay}
          disabled={!canPay}
          className={cn(
            "rounded-lg px-6 py-3 text-sm font-medium transition-colors",
            canPay
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {isPaying ? "Обработка..." : `Оплатить ${formatPrice(total)}`}
        </button>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-background focus:ring-primary/30 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
      />
    </label>
  );
}
