import Link from "next/link";
import Image from "next/image";

import { FollowButton } from "./FollowButton";
import { ROUTES } from "@/lib/constants";
import type { Seller } from "@/types";

export function SellerHeader({ seller }: { seller: Seller }) {
  return (
    <div className="flex items-center gap-3">
      <Link href={ROUTES.sellerPublic(seller.username)} className="shrink-0">
        <Image
          src={seller.avatar}
          alt={seller.displayName}
          width={40}
          height={40}
          className="rounded-full object-cover"
        />
      </Link>

      <div className="flex min-w-0 flex-col">
        <Link
          href={ROUTES.sellerPublic(seller.username)}
          className="hover:text-primary truncate font-medium"
        >
          {seller.displayName}
        </Link>
        <span className="text-muted-foreground truncate text-xs">@{seller.username}</span>
      </div>

      <div className="ml-auto">
        <FollowButton
          sellerId={seller.id}
          initialIsFollowing={seller.isFollowing}
          followersCount={seller.followersCount}
        />
      </div>
    </div>
  );
}
