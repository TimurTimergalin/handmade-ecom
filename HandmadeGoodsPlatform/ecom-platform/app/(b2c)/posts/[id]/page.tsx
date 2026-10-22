import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import DOMPurify from "isomorphic-dompurify";

import { PostDiscussion } from "@/components/features/PostDiscussion";
import { ProductSnippet } from "@/components/features/ProductSnippet";
import { SellerHeader } from "@/components/features/SellerHeader";
import { getPost, getPostComments } from "@/services/api";
import { timeAgo } from "@/lib/utils";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) notFound();

  const comments = await getPostComments(id).catch(() => []);

  return (
    <div className="container mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <Link href="/" className="text-primary text-sm hover:underline">
        ← Лента
      </Link>

      <article className="bg-card flex flex-col gap-4 rounded-xl border p-4">
        <SellerHeader seller={post.seller} />
        <div>
          <h1 className="text-2xl leading-tight font-bold">{post.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{timeAgo(post.createdAt)}</p>
        </div>
        {post.coverImage ? (
          <div className="bg-muted relative aspect-[16/9] overflow-hidden rounded-lg">
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              sizes="(max-width: 768px) 100vw, 640px"
              className="object-cover"
              priority
            />
          </div>
        ) : null}
        <div
          className="prose prose-sm text-foreground max-w-none"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.body) }}
        />
        {post.products.length > 0 ? (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
            {post.products.map((product) => (
              <ProductSnippet key={product.id} product={product} />
            ))}
          </div>
        ) : null}
      </article>

      <PostDiscussion
        postId={post.id}
        initialLiked={post.isLiked}
        initialLikes={post.likesCount}
        initialComments={comments}
      />
    </div>
  );
}
