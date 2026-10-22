import Image from "next/image";
import Link from "next/link";

import { SellerHeader } from "./SellerHeader";
import { ProductSnippet } from "./ProductSnippet";
import { ROUTES } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";
import type { Post } from "@/types";

export function PostCard({ post }: { post: Post }) {
  return (
    <article className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <SellerHeader seller={post.seller} />

      <div className="flex flex-col gap-2">
        <h2 className="text-lg leading-tight font-semibold">
          <Link href={ROUTES.post(post.id)} className="hover:underline">
            {post.title}
          </Link>
        </h2>
        {post.summary ? <p className="text-foreground/80 text-sm">{post.summary}</p> : null}
      </div>

      {post.coverImage && (
        <div className="bg-muted relative aspect-[16/9] overflow-hidden rounded-lg">
          <Image
            src={post.coverImage}
            alt={post.title}
            fill
            sizes="(max-width: 768px) 100vw, 600px"
            className="object-cover"
          />
        </div>
      )}

      {post.products.length > 0 && (
        <div className="-mx-4 flex scrollbar-thin gap-3 overflow-x-auto px-4 pb-2">
          {post.products.map((product) => (
            <ProductSnippet key={product.id} product={product} />
          ))}
        </div>
      )}

      <div className="text-muted-foreground flex items-center gap-4 text-xs">
        <Link href={ROUTES.post(post.id)} className="hover:text-foreground">
          ♥ {post.likesCount}
        </Link>
        <Link href={ROUTES.post(post.id)} className="hover:text-foreground">
          💬 {post.commentsCount}
        </Link>
        <span className="ml-auto">{timeAgo(post.createdAt)}</span>
      </div>
    </article>
  );
}
