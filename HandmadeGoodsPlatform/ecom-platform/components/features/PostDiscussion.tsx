"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { addPostComment, togglePostLike, type PostComment } from "@/services/api";
import { ROUTES } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";

export function PostDiscussion({
  postId,
  initialLiked,
  initialLikes,
  initialComments,
}: {
  postId: string;
  initialLiked: boolean;
  initialLikes: number;
  initialComments: PostComment[];
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [likes, setLikes] = useState(initialLikes);
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleLike() {
    const next = !liked;
    setLiked(next);
    setLikes((count) => count + (next ? 1 : -1));
    try {
      const result = await togglePostLike(postId, liked);
      setLiked(result.isLiked);
      setLikes(result.likesCount);
    } catch (error) {
      setLiked(!next);
      setLikes((count) => count + (next ? -1 : 1));
      toast.error(error instanceof Error ? error.message : "Не удалось обновить отметку");
    }
  }

  async function handleComment() {
    const body = draft.trim();
    if (!body || isSaving) return;
    setIsSaving(true);
    try {
      const comment = await addPostComment(postId, body);
      setComments((current) => [comment, ...current]);
      setDraft("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить комментарий");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => void handleLike()}
        className="hover:bg-muted w-fit rounded-lg border px-4 py-2 text-sm font-medium"
      >
        {liked ? "♥" : "♡"} {likes}
      </button>

      <div className="flex flex-col gap-3">
        <h2 className="font-semibold">Комментарии</h2>
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            placeholder="Напишите комментарий"
            className="bg-background focus:ring-primary/30 resize-y rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
          <button
            type="button"
            onClick={() => void handleComment()}
            disabled={isSaving || !draft.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 w-fit rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {isSaving ? "Отправка..." : "Отправить"}
          </button>
          <p className="text-muted-foreground text-xs">
            Комментарий и отметка доступны после{" "}
            <Link href={ROUTES.login} className="text-primary hover:underline">
              входа
            </Link>
            .
          </p>
        </div>
        {comments.length === 0 ? (
          <p className="text-muted-foreground text-sm">Пока нет комментариев.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {comments.map((comment) => (
              <li key={comment.id} className="bg-card rounded-xl border p-3">
                <div className="text-sm font-medium">
                  {comment.author.displayName || comment.author.username || "Читатель"}
                </div>
                <p className="mt-1 text-sm">{comment.body}</p>
                <div className="text-muted-foreground mt-1 text-xs">{timeAgo(comment.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
