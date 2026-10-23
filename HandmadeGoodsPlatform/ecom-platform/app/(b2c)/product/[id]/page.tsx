import { notFound } from "next/navigation";

import { DeliveryBlock } from "@/components/features/DeliveryBlock";
import { ProductActions } from "@/components/features/ProductActions";
import { ProductGallery } from "@/components/features/ProductGallery";
import { SellerCardCompact } from "@/components/features/SellerCardCompact";
import { getProduct } from "@/services/api";
import { formatPrice } from "@/lib/utils";
import { SALE_MODE_LABELS, saleAvailability } from "@/lib/constants";
import type { Seller } from "@/types";

function SellerLegalNote({ seller }: { seller: Seller }) {
  const name =
    seller.legalType === "company"
      ? seller.legalName?.trim()
      : [seller.lastName, seller.firstName, seller.patronymic]
          .map((part) => part?.trim())
          .filter(Boolean)
          .join(" ");
  const inn = seller.inn?.trim();
  const ogrn = seller.ogrn?.trim();
  const address = seller.legalType === "company" ? seller.legalAddress?.trim() : "";
  if (!name && !inn) return null;
  const parts = [
    name ? `Продавец: ${name}` : "Продавец",
    inn ? `ИНН ${inn}` : "",
    ogrn ? `${seller.legalType === "company" ? "ОГРН" : "ОГРНИП"} ${ogrn}` : "",
    address ?? "",
  ].filter(Boolean);
  return <p className="text-muted-foreground mt-3 text-xs leading-relaxed">{parts.join(" · ")}</p>;
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) {
    notFound();
  }

  const availability = saleAvailability(product);

  return (
    <div className="container mx-auto max-w-5xl px-4 pt-6 pb-28 md:pb-6">
      <div className="grid gap-6 md:grid-cols-2">
        <ProductGallery image={product.image} images={product.images} title={product.title} />

        {/* Информация */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl leading-tight font-bold">{product.title}</h1>
            {availability !== "online" && (
              <span className="bg-muted text-muted-foreground mt-2 inline-block rounded-full px-2 py-1 text-xs">
                {SALE_MODE_LABELS[availability]}
              </span>
            )}
          </div>

          {product.description && (
            <p className="text-foreground/80 text-sm whitespace-pre-line">{product.description}</p>
          )}

          <section className="bg-background fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 md:static md:z-auto md:rounded-lg md:border md:bg-transparent md:p-4">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 md:mx-0 md:max-w-none md:flex-col md:items-stretch md:gap-4">
              <div className="shrink-0 text-xl font-bold md:text-3xl">{formatPrice(product.price)}</div>
              <ProductActions product={product} />
            </div>
          </section>

          <DeliveryBlock product={product} />

          <div className="text-muted-foreground text-sm">
            {availability === "online" && (
              <>
                В наличии: <span className="text-foreground font-medium">{product.inStock}</span>{" "}
                шт.
              </>
            )}
            {availability === "out_of_stock" && "Нет в наличии"}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <SellerCardCompact seller={product.seller} />
        <SellerLegalNote seller={product.seller} />
      </div>
    </div>
  );
}
