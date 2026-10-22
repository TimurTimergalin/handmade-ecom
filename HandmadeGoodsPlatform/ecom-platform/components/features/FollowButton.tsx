"use client";

import { useState } from "react";
import { toast } from "sonner";

import { followSeller, unfollowSeller } from "@/services/api";
import { cn } from "@/lib/utils";

export function FollowButton({
  sellerId,
  initialIsFollowing,
  followersCount,
}: {
  sellerId: string;
  initialIsFollowing: boolean;
  followersCount: number;
}) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [count, setCount] = useState(followersCount);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const next = !isFollowing;
    setIsFollowing(next);
    setCount((c) => c + (next ? 1 : -1));

    try {
      const result = next ? await followSeller(sellerId) : await unfollowSeller(sellerId);
      if (typeof result?.followersCount === "number") {
        setCount(result.followersCount);
      }
      toast.success(next ? "Вы подписались" : "Вы отписались");
    } catch (error) {
      setIsFollowing(!next);
      setCount((c) => c + (next ? -1 : 1));
      toast.error(error instanceof Error ? error.message : "Не удалось обновить подписку");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        isFollowing
          ? "bg-background hover:bg-muted border"
          : "bg-primary text-primary-foreground hover:bg-primary/90"
      )}
    >
      {isFollowing ? "Вы подписаны" : "Подписаться"}
      <span className="text-muted-foreground ml-1">· {count}</span>
    </button>
  );
}
