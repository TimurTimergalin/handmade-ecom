import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";

import { ROUTES } from "@/lib/constants";
import { pluralize } from "@/lib/utils";
import type { Seller } from "@/types";

export function SellerCardCompact({ seller }: { seller: Seller }) {
  return (
    <div className="bg-card flex items-center gap-4 rounded-xl border p-4">
      <Link href={ROUTES.sellerPublic(seller.username)} className="shrink-0">
        <Image
          src={seller.avatar}
          alt={seller.displayName}
          width={56}
          height={56}
          className="rounded-full object-cover"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={ROUTES.sellerPublic(seller.username)}
          className="hover:text-primary truncate font-medium"
        >
          {seller.displayName}
        </Link>

        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {seller.rating.toFixed(1)}
          </span>
          <span>
            {seller.followersCount}{" "}
            {pluralize(seller.followersCount, ["подписчик", "подписчика", "подписчиков"])}
          </span>
        </div>
      </div>

      <Link
        href={ROUTES.sellerPublic(seller.username)}
        className="hover:bg-muted shrink-0 rounded-md border px-4 py-2 text-sm font-medium transition-colors"
      >
        В магазин
      </Link>
    </div>
  );
}
