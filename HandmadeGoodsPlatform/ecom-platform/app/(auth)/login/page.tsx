import { AuthTabs } from "@/components/features/AuthTabs";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent } = await searchParams;
  return <AuthTabs isSellerIntent={intent === "seller"} />;
}
