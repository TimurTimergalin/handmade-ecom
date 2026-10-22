import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";

import { FollowButton } from "./FollowButton";
import { ROUTES } from "@/lib/constants";
import { pluralize } from "@/lib/utils";
import type { Seller } from "@/types";

export function SellerCard({ seller }: { seller: Seller }) {
  return (
    <div className="bg-card flex flex-col items-center gap-3 rounded-xl border p-4 text-center">
      <Link href={ROUTES.sellerPublic(seller.username)}>
        <Image
          src={seller.avatar}
          alt={seller.displayName}
          width={72}
          height={72}
          className="rounded-full object-cover"
        />
      </Link>

      <div className="flex w-full min-w-0 flex-col gap-0.5">
        <Link
          href={ROUTES.sellerPublic(seller.username)}
          className="hover:text-primary truncate font-medium"
        >
          {seller.displayName}
        </Link>
        <span className="text-muted-foreground truncate text-xs">@{seller.username}</span>
      </div>

      <div className="text-muted-foreground flex items-center gap-1 text-xs">
        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
        <span>{seller.rating.toFixed(1)}</span>
        <span>·</span>
        <span>
          {seller.followersCount}{" "}
          {pluralize(seller.followersCount, ["подписчик", "подписчика", "подписчиков"])}
        </span>
      </div>

      {seller.bio && <p className="text-muted-foreground line-clamp-2 text-xs">{seller.bio}</p>}

      <FollowButton
        sellerId={seller.id}
        initialIsFollowing={seller.isFollowing}
        followersCount={seller.followersCount}
      />
    </div>
  );
}
