import { notFound } from "next/navigation";

import { PostForm } from "@/components/features/PostForm";
import { getSellerPost, getSellerProducts } from "@/services/api";

export default async function PostEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";

  let post = undefined;
  if (!isNew) {
    const found = await getSellerPost(id);
    if (!found) notFound();
    post = found;
  }

  const products = await getSellerProducts();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">
          {isNew ? "Новая публикация" : "Редактирование публикации"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {isNew ? "Расскажите о своём творчестве и прикрепите товары" : `ID: ${id}`}
        </p>
      </div>

      <PostForm initialPost={post} availableProducts={products} />
    </div>
  );
}
