import { Feed } from "@/components/features/Feed";
import { ProductCard } from "@/components/features/ProductCard";
import { SearchBar } from "@/components/features/SearchBar";
import { SearchTabs } from "@/components/features/SearchTabs";
import { SellerCard } from "@/components/features/SellerCard";
import { searchPosts, searchProducts, searchSellers } from "@/services/api";

type Tab = "posts" | "products" | "sellers";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const { q = "", tab = "posts" } = await searchParams;
  const currentTab = tab as Tab;

  return (
    <div className="container mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
      <SearchBar initialValue={q} />
      <SearchTabs />

      {!q ? (
        <EmptyState message="Введите запрос, чтобы начать поиск" />
      ) : (
        <SearchResults q={q} tab={currentTab} />
      )}
    </div>
  );
}

async function SearchResults({ q, tab }: { q: string; tab: Tab }) {
  if (tab === "products") {
    const products = await searchProducts(q);
    if (products.length === 0) {
      return <EmptyState message="Товары не найдены" />;
    }
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    );
  }

  if (tab === "sellers") {
    const sellers = await searchSellers(q);
    if (sellers.length === 0) {
      return <EmptyState message="Продавцы не найдены" />;
    }
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {sellers.map((s) => (
          <SellerCard key={s.id} seller={s} />
        ))}
      </div>
    );
  }

  // tab === "posts"
  const posts = await searchPosts(q);
  if (posts.length === 0) {
    return <EmptyState message="Публикации не найдены" />;
  }
  return <Feed posts={posts} />;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground py-16 text-center">
      <p className="text-lg">{message}</p>
    </div>
  );
}
