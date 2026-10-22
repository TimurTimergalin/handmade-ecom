import { AuthTabs } from "@/components/features/AuthTabs";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent } = await searchParams;

  return <AuthTabs mode="register" isSellerIntent={intent === "seller"} />;
}
