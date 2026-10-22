import { ProfileContent } from "@/components/features/ProfileContent";
import { getOrders } from "@/services/api";

export default async function AccountPage() {
  const orders = await getOrders();
  return <ProfileContent orderCount={orders.length} />;
}
