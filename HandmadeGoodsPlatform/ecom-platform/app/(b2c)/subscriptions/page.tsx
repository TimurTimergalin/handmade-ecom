import { Feed } from "@/components/features/Feed";
import { SearchBar } from "@/components/features/SearchBar";
import { SellerCard } from "@/components/features/SellerCard";
import { SubscriptionTabs } from "@/components/features/SubscriptionTabs";
import { ROUTES } from "@/lib/constants";
import { getSubscriptionPosts, getSubscriptionSellers } from "@/services/api";

type Tab = "posts" | "sellers";

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const { q = "", tab = "posts" } = await searchParams;
  const currentTab: Tab = tab === "sellers" ? "sellers" : "posts";
  const href = `${ROUTES.follow}?tab=${currentTab}`;

  return (
    <div className="container mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
      <h1 className="text-3xl font-bold">Подписки</h1>
      <SearchBar initialValue={q} href={href} />
      <SubscriptionTabs />
      {currentTab === "sellers" ? (
        <Sellers q={q} />
      ) : (
        <Posts q={q} />
      )}
    </div>
  );
}

async function Posts({ q }: { q: string }) {
  const posts = await getSubscriptionPosts(q);
  if (posts.length === 0) {
    return (
      <EmptyState
        message={q ? "Ничего не найдено" : "Вы ещё ни на кого не подписаны"}
      />
    );
  }
  return <Feed posts={posts} />;
}

async function Sellers({ q }: { q: string }) {
  const sellers = await getSubscriptionSellers(q);
  if (sellers.length === 0) {
    return (
      <EmptyState
        message={q ? "Ничего не найдено" : "Вы ещё ни на кого не подписаны"}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {sellers.map((seller) => (
        <SellerCard key={seller.id} seller={seller} />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground py-16 text-center">
      <p className="text-lg">{message}</p>
    </div>
  );
}
