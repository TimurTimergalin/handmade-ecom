import { PostsManager } from "@/components/features/PostsManager";
import { getSellerPosts } from "@/services/api";

export default async function SellerPostsPage() {
  const posts = await getSellerPosts();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Публикации</h1>
        <p className="text-muted-foreground mt-1 text-sm">Ваши посты в ленте</p>
      </div>
      <PostsManager posts={posts} />
    </div>
  );
}
