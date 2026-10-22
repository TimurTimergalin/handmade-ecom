import { Feed } from "@/components/features/Feed";
import { ProductCard } from "@/components/features/ProductCard";
import { SearchBar } from "@/components/features/SearchBar";
import { getPosts, getRecommendations } from "@/services/api";

export default async function HomePage() {
  const [posts, recommendations] = await Promise.all([getPosts(), getRecommendations()]);

  return (
    <div className="container mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <SearchBar />
      {recommendations.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Рекомендации</h2>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            {recommendations.map((product) => (
              <div key={product.id} className="w-44 shrink-0">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </section>
      )}
      <Feed posts={posts} />
    </div>
  );
}
