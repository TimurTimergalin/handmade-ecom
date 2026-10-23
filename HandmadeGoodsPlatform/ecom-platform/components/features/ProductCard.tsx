import Image from "next/image";
import Link from "next/link";

import { ProductSnippetActions } from "./ProductSnippetActions";
import { ROUTES, SALE_MODE_LABELS, saleAvailability } from "@/lib/constants";
import { formatSnippetDeliveryLabel } from "@/lib/delivery-date";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types";

export function ProductCard({ product }: { product: Product }) {
  const isAvailable = saleAvailability(product) === "online";

  return (
    <Link
      href={ROUTES.product(product.id)}
      className="group bg-card flex flex-col overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
    >
      <div className="bg-muted relative aspect-square">
        <Image
          src={product.image}
          alt={product.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 250px"
          className="object-cover transition-transform group-hover:scale-105"
        />
      </div>

      <div className="flex h-[8.875rem] flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm leading-tight font-medium">{product.title}</h3>

        <div className="text-base leading-tight font-bold">{formatPrice(product.price)}</div>

        <div className="text-muted-foreground text-xs leading-tight">
          {formatSnippetDeliveryLabel(product)}
          {!isAvailable && ` · ${SALE_MODE_LABELS[saleAvailability(product)]}`}
        </div>

        <ProductSnippetActions product={product} className="mt-auto w-full" />
      </div>
    </Link>
  );
}
