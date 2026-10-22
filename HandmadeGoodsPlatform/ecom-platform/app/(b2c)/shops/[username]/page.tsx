import { notFound } from "next/navigation";

import { Feed } from "@/components/features/Feed";
import { ProductCard } from "@/components/features/ProductCard";
import { SearchBar } from "@/components/features/SearchBar";
import { SellerProfileHeader } from "@/components/features/SellerProfileHeader";
import { SellerTabs } from "@/components/features/SellerTabs";
import { ROUTES } from "@/lib/constants";
import { getSeller, getPostsBySeller, getProductsBySeller } from "@/services/api";

type Tab = "posts" | "products";

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { username } = await params;
  const { tab = "posts", q = "" } = await searchParams;
  const currentTab = tab as Tab;

  const seller = await getSeller(username);
  if (!seller) {
    notFound();
  }

  const posts = currentTab === "posts" ? await getPostsBySeller(seller.id) : [];
  const products = currentTab === "products" ? await getProductsBySeller(seller.id) : [];

  const filteredProducts = q
    ? products.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()))
    : products;

  return (
    <div className="container mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
      <SellerProfileHeader seller={seller} />
      <SellerTabs username={username} />

      {currentTab === "posts" && (
        <>
          {posts.length === 0 ? (
            <EmptyState message="Пока нет публикаций" />
          ) : (
            <Feed posts={posts} />
          )}
        </>
      )}

      {currentTab === "products" && (
        <>
          <SearchBar
            initialValue={q}
            href={`${ROUTES.sellerPublic(username)}?tab=products`}
          />
          {filteredProducts.length === 0 ? (
            <EmptyState message={q ? "Товары не найдены" : "Пока нет товаров"} />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {filteredProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </>
      )}
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
