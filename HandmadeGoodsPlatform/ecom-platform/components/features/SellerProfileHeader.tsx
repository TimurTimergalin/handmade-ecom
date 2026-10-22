import Image from "next/image";
import { Star } from "lucide-react";

import { FollowButton } from "./FollowButton";
import { pluralize, timeAgo } from "@/lib/utils";
import type { Seller } from "@/types";

export function SellerProfileHeader({ seller }: { seller: Seller }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <Image
        src={seller.avatar}
        alt={seller.displayName}
        width={96}
        height={96}
        className="shrink-0 rounded-full object-cover"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{seller.displayName}</h1>
            <p className="text-muted-foreground text-sm">@{seller.username}</p>
          </div>

          <FollowButton
            sellerId={seller.id}
            initialIsFollowing={seller.isFollowing}
            followersCount={seller.followersCount}
          />
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-1">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span className="text-foreground font-medium">{seller.rating.toFixed(1)}</span>
          </span>
          <span>
            {seller.followersCount}{" "}
            {pluralize(seller.followersCount, ["подписчик", "подписчика", "подписчиков"])}
          </span>
          <span>
            {seller.productsCount} {pluralize(seller.productsCount, ["товар", "товара", "товаров"])}
          </span>
          <span>На платформе {timeAgo(seller.joinedAt)}</span>
        </div>

        {seller.bio && (
          <p className="text-foreground/80 text-sm whitespace-pre-line">{seller.bio}</p>
        )}
      </div>
    </div>
  );
}
