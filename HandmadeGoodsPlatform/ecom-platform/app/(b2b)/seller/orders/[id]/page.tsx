import { notFound } from "next/navigation";

import { SellerOrderDetail } from "@/components/features/SellerOrderDetail";
import { getSellerOrder } from "@/services/api";

export default async function SellerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getSellerOrder(id);

  if (!order) {
    notFound();
  }

  return <SellerOrderDetail order={order} />;
}
