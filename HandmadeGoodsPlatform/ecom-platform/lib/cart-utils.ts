import type { CartGroup, CartItem, Product } from "@/types";

export function groupCartItems(items: CartItem[], allProducts: Product[]): CartGroup[] {
  const productById = new Map<string, Product>();
  for (const p of allProducts) productById.set(p.id, p);

  const groups = new Map<string, CartGroup>();

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product) continue;

    const key = `${product.sellerId}__${item.delivery}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        seller: product.seller,
        delivery: item.delivery,
        items: [],
        unavailableItems: [],
      });
    }

    const group = groups.get(key)!;
    const isAvailable = product.saleMode === "online";

    if (isAvailable) {
      group.items.push(item);
    } else {
      group.unavailableItems.push(item);
    }
  }

  return Array.from(groups.values());
}

export function calculateTotal(groups: CartGroup[], allProducts: Product[]): number {
  const productById = new Map(allProducts.map((p) => [p.id, p]));
  let total = 0;

  for (const group of groups) {
    for (const item of group.items) {
      const product = productById.get(item.productId);
      if (product) total += product.price * item.quantity;
    }
  }

  return total;
}
