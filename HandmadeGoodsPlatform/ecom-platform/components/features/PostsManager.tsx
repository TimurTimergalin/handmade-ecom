"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deletePost } from "@/services/api";
import { ROUTES } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";
import type { Post } from "@/types";

export function PostsManager({ posts }: { posts: Post[] }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(posts);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = items.filter((p) => p.title.toLowerCase().includes(query.toLowerCase()));

  async function handleDelete(id: string) {
    try {
      await deletePost(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      toast.success("Публикация удалена");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить публикацию");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={ROUTES.seller.postNew}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Создать пост
        </Link>

        <div className="relative min-w-[200px] flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по заголовку..."
            className="bg-background focus:ring-primary/30 w-full rounded-lg border py-2 pr-3 pl-9 text-sm outline-none focus:ring-2"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card text-muted-foreground rounded-xl border p-12 text-center">
          {items.length === 0
            ? "У вас пока нет публикаций. Создайте первую."
            : "Публикации не найдены"}
        </div>
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <ul className="divide-y">
            {filtered.map((post) => (
              <li
                key={post.id}
                className="hover:bg-muted/40 flex items-center gap-4 p-4 transition-colors"
              >
                {post.coverImage ? (
                  <div className="bg-muted relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
                    <Image
                      src={post.coverImage}
                      alt={post.title}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="bg-muted h-16 w-16 shrink-0 rounded-md" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{post.title}</div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {timeAgo(post.createdAt)} · {post.products.length} товаров · ♥ {post.likesCount}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={ROUTES.seller.postEdit(post.id)}
                    className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-md p-2"
                    aria-label="Редактировать"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setDeletingId(post.id)}
                    className="hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-md p-2"
                    aria-label="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card flex w-full max-w-sm flex-col gap-4 rounded-xl border p-6">
            <div>
              <h3 className="font-semibold">Удалить публикацию?</h3>
              <p className="text-muted-foreground mt-1 text-sm">Это действие нельзя отменить.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deletingId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg px-4 py-2 text-sm font-medium"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
