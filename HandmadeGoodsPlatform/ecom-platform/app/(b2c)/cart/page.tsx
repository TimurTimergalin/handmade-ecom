import { CartContent } from "@/components/features/CartContent";
import { getProducts } from "@/services/api";

export default async function CartPage() {
  const products = await getProducts();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 text-3xl font-bold">Корзина</h1>
      <CartContent allProducts={products} />
    </div>
  );
}
