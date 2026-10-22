import { SellerOrdersManager } from "@/components/features/SellerOrdersManager";
import { getOrdersBySeller } from "@/services/api";

export default async function SellerOrdersPage() {
  const orders = await getOrdersBySeller("");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Заказы</h1>
        <p className="text-muted-foreground mt-1 text-sm">Входящие заказы от покупателей</p>
      </div>
      <SellerOrdersManager orders={orders} />
    </div>
  );
}
