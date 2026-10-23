import type { CartGroup, CartItem, DeliveryMethod, Product } from "@/types";
import { saleAvailability } from "@/lib/constants";

const DELIVERY_ORDER: DeliveryMethod[] = ["pickup", "cdek"];

function pushItem(bucket: CartItem[], item: CartItem) {
  const existing = bucket.find((entry) => entry.productId === item.productId);
  if (existing) {
    existing.quantity += item.quantity;
    return;
  }
  bucket.push({ productId: item.productId, quantity: item.quantity });
}

export function groupCartItems(items: CartItem[], allProducts: Product[]): CartGroup[] {
  const productById = new Map<string, Product>();
  for (const product of allProducts) productById.set(product.id, product);

  const groups = new Map<string, CartGroup>();

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product) continue;

    const key = product.sellerId;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        seller: product.seller,
        items: [],
        unavailableItems: [],
      });
    }

    const group = groups.get(key)!;
    const bucket = saleAvailability(product) === "online" ? group.items : group.unavailableItems;
    pushItem(bucket, item);
  }

  return Array.from(groups.values());
}

/** Способы, которые подходят каждому заказываемому товару продавца. */
export function deliveryMethodsForGroup(
  group: CartGroup,
  productById: Map<string, Product>
): DeliveryMethod[] {
  const products = group.items
    .map((item) => productById.get(item.productId))
    .filter((product): product is Product => Boolean(product));
  if (products.length === 0) return [];

  return DELIVERY_ORDER.filter((method) =>
    products.every((product) => product.availableDeliveries.includes(method))
  );
}

export function calculateTotal(groups: CartGroup[], allProducts: Product[]): number {
  const productById = new Map(allProducts.map((product) => [product.id, product]));
  let total = 0;

  for (const group of groups) {
    for (const item of group.items) {
      const product = productById.get(item.productId);
      if (product) total += product.price * item.quantity;
    }
  }

  return total;
}
