import { notFound } from "next/navigation";
import Image from "next/image";

import { DeliveryBlock } from "@/components/features/DeliveryBlock";
import { ProductActions } from "@/components/features/ProductActions";
import { SellerCardCompact } from "@/components/features/SellerCardCompact";
import { getProduct } from "@/services/api";
import { formatPrice } from "@/lib/utils";
import { SALE_MODE_LABELS } from "@/lib/constants";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) {
    notFound();
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Галерея */}
        <div className="bg-muted relative aspect-square overflow-hidden rounded-xl">
          <Image
            src={product.image}
            alt={product.title}
            fill
            sizes="(max-width: 768px) 100vw, 500px"
            className="object-cover"
            priority
          />
        </div>

        {/* Информация */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl leading-tight font-bold">{product.title}</h1>
            {product.saleMode !== "online" && (
              <span className="bg-muted text-muted-foreground mt-2 inline-block rounded-full px-2 py-1 text-xs">
                {SALE_MODE_LABELS[product.saleMode]}
              </span>
            )}
          </div>

          <div className="text-3xl font-bold">{formatPrice(product.price)}</div>

          {product.description && (
            <p className="text-foreground/80 text-sm whitespace-pre-line">{product.description}</p>
          )}

          <DeliveryBlock product={product} />

          <div className="text-muted-foreground text-sm">
            {product.saleMode === "online" && (
              <>
                В наличии: <span className="text-foreground font-medium">{product.inStock}</span>{" "}
                шт.
              </>
            )}
          </div>

          <ProductActions product={product} />
        </div>
      </div>

      <div className="mt-8">
        <SellerCardCompact seller={product.seller} />
      </div>
    </div>
  );
}
