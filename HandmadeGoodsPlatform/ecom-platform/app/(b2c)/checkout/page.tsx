import { CheckoutContent } from "@/components/features/CheckoutContent";
import { getProducts } from "@/services/api";

export default async function CheckoutPage() {
  const products = await getProducts();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 text-3xl font-bold">Оформление заказа</h1>
      <CheckoutContent allProducts={products} />
    </div>
  );
}
