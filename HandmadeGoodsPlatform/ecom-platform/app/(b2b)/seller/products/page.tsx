import { ProductsManager } from "@/components/features/ProductsManager";
import { getSellerProducts } from "@/services/api";

export default async function SellerProductsPage() {
  const products = await getSellerProducts();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Товары</h1>
        <p className="text-muted-foreground mt-1 text-sm">Управление каталогом</p>
      </div>
      <ProductsManager products={products} />
    </div>
  );
}
