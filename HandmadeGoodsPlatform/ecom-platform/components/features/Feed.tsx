import { PostCard } from "./PostCard";
import type { Post } from "@/types";

export function Feed({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return (
      <div className="text-muted-foreground py-16 text-center">
        <p className="text-lg">Пока нет публикаций</p>
        <p className="mt-2 text-sm">Загляните позже или попробуйте поиск.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
