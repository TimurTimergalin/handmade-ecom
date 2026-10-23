import type { DeliveryMethod, Product } from "@/types";

const DELIVERY_DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
});

const MAX_LEAD_DAYS = 365;
const WEEK_DAYS = 7;

/** Те же подписи, что DELIVERY_LABELS. Копия без рантайм-импорта, чтобы дату можно было посчитать в node. */
const METHOD_LABEL: Record<DeliveryMethod, string> = {
  pickup: "Самовывоз",
  cdek: "СДЭК",
};

function isLeadDays(value: number | undefined): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_LEAD_DAYS
  );
}

/** 0 понедельник … 6 воскресенье. */
function isShipDay(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

/** Индекс дня недели переданной даты: 0 понедельник … 6 воскресенье. Считает локальный календарь `date`. */
export function weekdayMonday(date: Date): number {
  return (date.getDay() + 6) % WEEK_DAYS;
}

/** Ближайший самовывоз: минимум `maxDays` по пунктам. `null`, если срока нет. */
export function nearestPickupLeadDays(
  points: ReadonlyArray<{ maxDays?: number }> | undefined
): number | null {
  const leadDays = (points ?? []).map((point) => point.maxDays).filter(isLeadDays);
  if (leadDays.length === 0) return null;
  return Math.min(...leadDays);
}

/**
 * Ближайшая отгрузка СДЭК: ближайший отмеченный день, включая сегодня.
 * Дополнительных дней в пути нет. `null`, если отмеченных дней нет.
 */
export function nearestCdekShipOffset(
  shipDays: readonly number[] | undefined,
  now: Date
): number | null {
  if (!Array.isArray(shipDays) || shipDays.length === 0) return null;

  const allowed = new Set<number>();
  for (const day of shipDays) {
    if (isShipDay(day)) allowed.add(day);
  }
  if (allowed.size === 0) return null;

  const today = weekdayMonday(now);
  for (let offset = 0; offset < WEEK_DAYS; offset += 1) {
    if (allowed.has((today + offset) % WEEK_DAYS)) return offset;
  }
  return null;
}

/** 0 — «сегодня», 1 — «завтра», иначе «25 октября». Дату не сохраняет и `now` не меняет. */
export function formatDeliveryOffset(days: number, now: Date): string {
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  return formatCalendarDate(days, now);
}

/** Всегда «22 октября», в том числе для сегодня и завтра. */
function formatCalendarDate(days: number, now: Date): string {
  const date = new Date(now.getTime());
  date.setDate(date.getDate() + days);
  return DELIVERY_DATE_FORMAT.format(date);
}

function formatCdekDate(days: number, now: Date): string {
  return `от ${formatCalendarDate(days, now)}`;
}

function methodsLabel(product: Pick<Product, "availableDeliveries">): string {
  return product.availableDeliveries.map((method) => METHOD_LABEL[method]).join(" · ");
}

type DeliveryDateProduct = Pick<Product, "availableDeliveries" | "pickupPoints" | "cdekShipDays">;

/** Дата самовывоза без «от». `null`, если самовывоза или срока нет. */
export function formatPickupReadyLabel(
  product: DeliveryDateProduct,
  now: Date = new Date()
): string | null {
  if (!product.availableDeliveries.includes("pickup")) return null;
  const days = nearestPickupLeadDays(product.pickupPoints);
  if (days == null) return null;
  return formatDeliveryOffset(days, now);
}

/** «от …» по дню отгрузки СДЭК. `null`, если СДЭК или отмеченных дней нет. */
export function formatCdekShipmentLabel(
  product: DeliveryDateProduct,
  now: Date = new Date()
): string | null {
  if (!product.availableDeliveries.includes("cdek")) return null;
  const days = nearestCdekShipOffset(product.cdekShipDays, now);
  if (days == null) return null;
  return formatCdekDate(days, now);
}

/**
 * Подпись доставки на сниппете. Дата считается от `now` и нигде не сохраняется.
 *
 * Только самовывоз — дата без «от». Только СДЭК — «от 23 октября», без «сегодня» и «завтра».
 * Оба способа — более ранняя дата; «от» только если раньше день СДЭК.
 * В один день побеждает самовывоз, без «от». Нет ни срока, ни дней отгрузки — прежние названия через « · ».
 */
export function formatSnippetDeliveryLabel(
  product: DeliveryDateProduct,
  now: Date = new Date()
): string {
  const pickupDays = product.availableDeliveries.includes("pickup")
    ? nearestPickupLeadDays(product.pickupPoints)
    : null;
  const cdekDays = product.availableDeliveries.includes("cdek")
    ? nearestCdekShipOffset(product.cdekShipDays, now)
    : null;

  if (pickupDays == null && cdekDays == null) {
    return methodsLabel(product);
  }

  if (pickupDays != null && (cdekDays == null || pickupDays <= cdekDays)) {
    return formatDeliveryOffset(pickupDays, now);
  }

  if (cdekDays == null) return methodsLabel(product);
  return formatCdekDate(cdekDays, now);
}
