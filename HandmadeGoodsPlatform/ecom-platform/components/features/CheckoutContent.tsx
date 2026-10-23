"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Truck } from "lucide-react";

import { CdekWidget, type CdekOfficeSelection } from "@/components/features/CdekWidget";
import { CDEK_PHONE_HINT } from "@/components/features/DeliveryBlock";
import { createOrder, quoteCdekDelivery } from "@/services/api";
import { useAuthStore } from "@/store/auth";
import { useCartStore } from "@/store/cart";
import { calculateTotal, deliveryMethodsForGroup, groupCartItems } from "@/lib/cart-utils";
import { DELIVERY_LABELS, ROUTES } from "@/lib/constants";
import { cn, formatPrice, pluralize } from "@/lib/utils";
import type { CartGroup, DeliveryMethod, PickupPoint, Product } from "@/types";

interface CdekOffice {
  code: string;
  city: string;
  street: string;
  label: string;
  selectedAt: number;
}

interface CdekQuoteState {
  signature: string;
  price?: number;
  error?: string;
  loading?: boolean;
}

export function CheckoutContent({ allProducts }: { allProducts: Product[] }) {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const phone = useAuthStore((state) => state.user?.phone)?.trim() ?? "";
  const cdekAllowed = phone.length > 0;

  const [deliveryChoice, setDeliveryChoice] = useState<Record<string, DeliveryMethod>>({});
  const [pickupSelection, setPickupSelection] = useState<Record<string, number>>({});
  const [cdekOffice, setCdekOffice] = useState<Record<string, CdekOffice>>({});
  const [cdekQuotes, setCdekQuotes] = useState<Record<string, CdekQuoteState>>({});
  const [cdekWidgetGroup, setCdekWidgetGroup] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const cdekWidgetGroupRef = useRef<string | null>(null);
  const quoteTargetsRef = useRef<CdekQuoteTarget[]>([]);

  const productById = new Map(allProducts.map((product) => [product.id, product]));
  const groups = groupCartItems(items, allProducts);
  const orderableGroups = groups.filter((group) => group.items.length > 0);
  const quoteTargets = cdekQuoteTargets(orderableGroups, productById, deliveryChoice, cdekOffice);
  quoteTargetsRef.current = quoteTargets;
  const quoteTargetsKey = quoteTargets.map((target) => `${target.groupKey}:${target.signature}`).join(";");

  useEffect(() => {
    const targets = quoteTargetsRef.current;
    if (targets.length === 0) return;
    let cancelled = false;
    for (const target of targets) {
      setCdekQuotes((prev) => ({
        ...prev,
        [target.groupKey]: { signature: target.signature, loading: true },
      }));
      quoteCdekDelivery({
        sellerId: target.sellerId,
        toOfficeCode: target.code,
        itemCount: target.itemCount,
      })
        .then((price) => {
          if (cancelled) return;
          setCdekQuotes((prev) => ({
            ...prev,
            [target.groupKey]: { signature: target.signature, price },
          }));
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : "Не удалось рассчитать доставку";
          setCdekQuotes((prev) => ({
            ...prev,
            [target.groupKey]: { signature: target.signature, error: message },
          }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [quoteTargetsKey]);

  const goodsTotal = calculateTotal(groups, allProducts);
  const deliveryTotal = orderableGroups.reduce((sum, group) => {
    const price = readyCdekPrice(group, productById, deliveryChoice, cdekOffice, cdekQuotes);
    return sum + (price ?? 0);
  }, 0);
  const total = goodsTotal + deliveryTotal;

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

  const areGroupsValid = orderableGroups.every((group) =>
    isGroupReady(
      group,
      productById,
      deliveryChoice,
      pickupSelection,
      cdekOffice,
      cdekQuotes,
      cdekAllowed
    )
  );
  const cdekPending = orderableGroups.some((group) => {
    const available = deliveryMethodsForGroup(group, productById);
    const delivery = selectedDelivery(group.key, available, deliveryChoice);
    if (delivery !== "cdek") return false;
    return readyCdekPrice(group, productById, deliveryChoice, cdekOffice, cdekQuotes) === undefined;
  });

  const canPay = areGroupsValid && orderableGroups.length > 0 && !isPaying;

  function rememberCdekWidgetGroup(groupKey: string | null) {
    cdekWidgetGroupRef.current = groupKey;
    setCdekWidgetGroup(groupKey);
  }

  function handleCdekSelect(office: CdekOfficeSelection) {
    const groupKey = cdekWidgetGroupRef.current;
    if (!groupKey) return;
    const city = office.city?.trim() ?? "";
    const label = office.address.trim();
    let street = label;
    if (city && street.toLowerCase().startsWith(city.toLowerCase())) {
      street = street.slice(city.length).replace(/^[\s,]+/, "");
    }
    setCdekOffice((prev) => ({
      ...prev,
      [groupKey]: {
        code: office.code,
        city,
        street: street || label,
        label,
        selectedAt: Date.now(),
      },
    }));
    rememberCdekWidgetGroup(null);
  }

  async function handlePay() {
    if (!canPay) return;

    const orderGroups = orderableGroups.map((group) => {
      const available = deliveryMethodsForGroup(group, productById);
      const delivery = selectedDelivery(group.key, available, deliveryChoice);
      const payload: {
        sellerId: string;
        delivery: DeliveryMethod;
        items: { productId: string; quantity: number }[];
        pickupPoint?: PickupPoint;
      } = {
        sellerId: group.seller.id,
        delivery: delivery!,
        items: group.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      };

      if (delivery === "pickup") {
        const selected = pickupPointsFor(group, productById)[pickupSelection[group.key] ?? -1];
        if (selected) payload.pickupPoint = selected;
      }

      if (delivery === "cdek") {
        const office = cdekOffice[group.key];
        if (office?.code) {
          payload.pickupPoint = {
            city: office.city,
            address: office.street || office.label,
            code: office.code,
          };
        }
      }

      return payload;
    });

    setIsPaying(true);
    try {
      const result = await createOrder({ groups: orderGroups });
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

  const itemCount = orderableGroups.reduce(
    (sum, group) => sum + group.items.reduce((inner, item) => inner + item.quantity, 0),
    0
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:gap-6">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-40 lg:pb-1 lg:pr-1">
      {orderableGroups.map((group) => {
        const available = deliveryMethodsForGroup(group, productById);
        const delivery = selectedDelivery(group.key, available, deliveryChoice);
        const pointsList = pickupPointsFor(group, productById);
        const office = cdekOffice[group.key];
        const quote = matchingQuote(group, productById, deliveryChoice, cdekOffice, cdekQuotes);

        return (
          <section key={group.key} className="bg-card flex flex-col gap-4 rounded-xl border p-4">
            <div className="border-b pb-3 font-medium">{group.seller.displayName}</div>

            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">Способ доставки</div>
              {available.length === 0 ? (
                <p className="text-destructive text-sm">
                  У товаров этого продавца нет общего способа доставки. Уберите часть позиций из
                  корзины.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Способ доставки">
                  {available.map((method) => {
                    const isActive = delivery === method;
                    const blocked = method === "cdek" && !cdekAllowed;
                    const Icon = method === "pickup" ? MapPin : Truck;
                    return (
                      <button
                        key={method}
                        type="button"
                        disabled={blocked}
                        onClick={() => {
                          if (blocked) return;
                          setDeliveryChoice((prev) => ({ ...prev, [group.key]: method }));
                        }}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors",
                          blocked && "cursor-not-allowed opacity-50",
                          isActive
                            ? "border-primary bg-primary/5 text-foreground"
                            : "text-muted-foreground hover:bg-muted",
                          blocked && "hover:bg-transparent"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {DELIVERY_LABELS[method]}
                      </button>
                    );
                  })}
                </div>
              )}
              {available.includes("cdek") && !cdekAllowed && (
                <p className="text-sm text-orange-600">{CDEK_PHONE_HINT}</p>
              )}
            </div>

            {delivery === "pickup" && pointsList.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">Выберите точку самовывоза</div>
                <div className="flex flex-col gap-2">
                  {pointsList.map((point, index) => {
                    const isSelected = pickupSelection[group.key] === index;
                    return (
                      <label
                        key={`${point.city}__${point.address}`}
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
                            setPickupSelection((prev) => ({ ...prev, [group.key]: index }))
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

            {delivery === "cdek" && cdekAllowed && (
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">Пункт выдачи СДЭК</div>
                <button
                  type="button"
                  onClick={() => rememberCdekWidgetGroup(group.key)}
                  className="border-primary text-primary hover:bg-primary/5 self-start rounded-lg border px-4 py-2.5 text-sm font-medium"
                >
                  Выбрать пункт СДЭК
                </button>
                {office ? (
                  <p className="text-sm">{office.label}</p>
                ) : (
                  <p className="text-muted-foreground text-sm">Пункт выдачи не выбран</p>
                )}
                {quote?.loading && (
                  <p className="text-muted-foreground text-sm">Считаем стоимость доставки…</p>
                )}
                {typeof quote?.price === "number" && (
                  <p className="text-sm font-medium">Доставка: {formatPrice(quote.price)}</p>
                )}
                {quote?.error && <p className="text-destructive text-sm">{quote.error}</p>}
              </div>
            )}

            <div>
              <div className="mb-2 text-sm font-medium">Товары</div>
              <ul className="divide-y">
                {group.items.map((item) => {
                  const product = productById.get(item.productId);
                  if (!product) return null;
                  return (
                    <li
                      key={item.productId}
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
          </section>
        );
      })}
      </div>

      <aside className="bg-background fixed inset-x-0 bottom-0 z-30 border-t p-4 lg:static lg:z-auto lg:w-80 lg:shrink-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0">
        <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
          {deliveryTotal > 0 && (
            <div className="text-muted-foreground flex items-center justify-between gap-3 text-sm">
              <span>Доставка</span>
              <span>{formatPrice(deliveryTotal)}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-sm">
              Итого к оплате ({itemCount} {pluralize(itemCount, ["товар", "товара", "товаров"])})
            </span>
            <span className="text-2xl font-bold">{formatPrice(total)}</span>
          </div>

          {!canPay && !isPaying && (
            <div className={cn("text-xs", !cdekAllowed ? "text-orange-600" : "text-muted-foreground")}>
              {!cdekAllowed &&
              orderableGroups.some((group) =>
                deliveryMethodsForGroup(group, productById).includes("cdek")
              )
                ? CDEK_PHONE_HINT
                : cdekPending
                  ? "Выберите пункт СДЭК и дождитесь стоимости доставки"
                  : "Выберите способ доставки для каждого продавца"}
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
      </aside>

      <CdekWidget
        open={cdekWidgetGroup !== null}
        sender={false}
        onOpenChange={(open) => {
          if (!open) rememberCdekWidgetGroup(null);
        }}
        onSelect={handleCdekSelect}
      />
    </div>
  );
}

interface CdekQuoteTarget {
  groupKey: string;
  sellerId: string;
  code: string;
  itemCount: number;
  signature: string;
}

function cdekQuoteTargets(
  groups: CartGroup[],
  productById: Map<string, Product>,
  deliveryChoice: Record<string, DeliveryMethod>,
  cdekOffice: Record<string, CdekOffice>
): CdekQuoteTarget[] {
  const targets: CdekQuoteTarget[] = [];
  for (const group of groups) {
    const available = deliveryMethodsForGroup(group, productById);
    const delivery = selectedDelivery(group.key, available, deliveryChoice);
    const office = cdekOffice[group.key];
    if (delivery !== "cdek" || !office?.code) continue;
    const itemCount = group.items.reduce((sum, item) => sum + item.quantity, 0);
    if (itemCount < 1) continue;
    targets.push({
      groupKey: group.key,
      sellerId: group.seller.id,
      code: office.code,
      itemCount,
      signature: `${group.seller.id}|${office.code}|${itemCount}|${office.selectedAt}`,
    });
  }
  return targets;
}

function matchingQuote(
  group: CartGroup,
  productById: Map<string, Product>,
  deliveryChoice: Record<string, DeliveryMethod>,
  cdekOffice: Record<string, CdekOffice>,
  cdekQuotes: Record<string, CdekQuoteState>
): CdekQuoteState | undefined {
  const target = cdekQuoteTargets([group], productById, deliveryChoice, cdekOffice)[0];
  if (!target) return undefined;
  const quote = cdekQuotes[group.key];
  if (!quote || quote.signature !== target.signature) return undefined;
  return quote;
}

function readyCdekPrice(
  group: CartGroup,
  productById: Map<string, Product>,
  deliveryChoice: Record<string, DeliveryMethod>,
  cdekOffice: Record<string, CdekOffice>,
  cdekQuotes: Record<string, CdekQuoteState>
): number | undefined {
  const quote = matchingQuote(group, productById, deliveryChoice, cdekOffice, cdekQuotes);
  return typeof quote?.price === "number" ? quote.price : undefined;
}

function selectedDelivery(
  groupKey: string,
  available: DeliveryMethod[],
  choice: Record<string, DeliveryMethod>
): DeliveryMethod | undefined {
  const chosen = choice[groupKey];
  if (chosen && available.includes(chosen)) return chosen;
  return available[0];
}

function isGroupReady(
  group: CartGroup,
  productById: Map<string, Product>,
  deliveryChoice: Record<string, DeliveryMethod>,
  pickupSelection: Record<string, number>,
  cdekOffice: Record<string, CdekOffice>,
  cdekQuotes: Record<string, CdekQuoteState>,
  cdekAllowed: boolean
): boolean {
  const available = deliveryMethodsForGroup(group, productById);
  const delivery = selectedDelivery(group.key, available, deliveryChoice);
  if (!delivery) return false;
  if (delivery === "cdek" && !cdekAllowed) return false;

  if (delivery === "pickup") {
    const points = pickupPointsFor(group, productById);
    return points.length > 0 && pickupSelection[group.key] !== undefined;
  }

  return readyCdekPrice(group, productById, deliveryChoice, cdekOffice, cdekQuotes) !== undefined;
}

function pickupPointsFor(group: CartGroup, productById: Map<string, Product>): PickupPoint[] {
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
