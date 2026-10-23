import { CheckoutContent } from "@/components/features/CheckoutContent";
import { getProducts } from "@/services/api";

export default async function CheckoutPage() {
  const products = await getProducts();

  return (
    <div className="container mx-auto flex max-w-6xl flex-col px-4 py-6 lg:fixed lg:inset-x-0 lg:top-16 lg:bottom-0 lg:overflow-hidden">
      <h1 className="mb-6 shrink-0 text-3xl font-bold">Оформление заказа</h1>
      <CheckoutContent allProducts={products} />
    </div>
  );
}
