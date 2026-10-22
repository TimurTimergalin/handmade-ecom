import Image from "next/image";
import Link from "next/link";

import { ProductSnippetActions } from "./ProductSnippetActions";
import { ROUTES, DELIVERY_LABELS, SALE_MODE_LABELS } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types";

export function ProductCard({ product }: { product: Product }) {
  const isAvailable = product.saleMode === "online";

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

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm leading-tight font-medium">{product.title}</h3>

        <div className="mt-auto text-base font-bold">{formatPrice(product.price)}</div>

        <div className="text-muted-foreground text-xs">
          {product.availableDeliveries.map((d) => DELIVERY_LABELS[d]).join(" · ")}
          {!isAvailable && ` · ${SALE_MODE_LABELS[product.saleMode]}`}
        </div>

        <ProductSnippetActions product={product} />
      </div>
    </Link>
  );
}
