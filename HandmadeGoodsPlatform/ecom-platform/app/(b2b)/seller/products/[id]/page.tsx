import { notFound } from "next/navigation";

import { ProductForm } from "@/components/features/ProductForm";
import { getSellerProduct } from "@/services/api";

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";

  let product = undefined;
  if (!isNew) {
    const found = await getSellerProduct(id);
    if (!found) notFound();
    product = found;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">{isNew ? "Новый товар" : "Редактирование товара"}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {isNew ? "Заполните информацию о товаре" : `ID: ${id}`}
        </p>
      </div>
      <ProductForm initialProduct={product} />
    </div>
  );
}
