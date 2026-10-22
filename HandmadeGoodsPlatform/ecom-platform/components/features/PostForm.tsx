"use client";

import { useState } from "react";
import { PostEditor } from "./PostEditor";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { X, Plus, Check } from "lucide-react";

import { createPost, publishPost, updatePost, uploadImage } from "@/services/api";
import { ROUTES } from "@/lib/constants";
import { formatPrice, cn } from "@/lib/utils";
import type { Post, Product } from "@/types";

export function PostForm({
  initialPost,
  availableProducts,
}: {
  initialPost?: Post;
  availableProducts: Product[];
}) {
  const router = useRouter();
  const isEdit = !!initialPost;

  const [title, setTitle] = useState(initialPost?.title ?? "");
  const [summary, setSummary] = useState(initialPost?.summary ?? "");
  const [body, setBody] = useState(initialPost?.body ?? "");
  const [coverImage, setCoverImage] = useState(initialPost?.coverImage ?? "");
  const [selectedProducts, setSelectedProducts] = useState<Product[]>(initialPost?.products ?? []);
  const [isPickingProducts, setIsPickingProducts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  function toggleProduct(product: Product) {
    setSelectedProducts((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      return exists ? prev.filter((p) => p.id !== product.id) : [...prev, product];
    });
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Введите заголовок");
      return;
    }
    if (!summary.trim()) {
      toast.error("Введите описание для ленты и поиска");
      return;
    }
    if (summary.trim().length > 600) {
      toast.error("Описание не длиннее 600 символов");
      return;
    }
    const strippedBody = body.replace(/<[^>]*>/g, "").trim();
    if (!strippedBody) {
      toast.error("Введите полный текст публикации");
      return;
    }

    setIsSaving(true);
    const payload = {
      title: title.trim(),
      summary: summary.trim(),
      body,
      coverImage: coverImage.trim() || null,
      productIds: selectedProducts.map((product) => product.id),
    };

    try {
      let id = initialPost?.id ?? createdId;
      if (id) {
        await updatePost(id, payload);
      } else {
        const created = await createPost(payload);
        id = created.id;
        setCreatedId(id);
      }
      if (!initialPost) {
        await publishPost(id);
      }
      toast.success(isEdit ? "Публикация обновлена" : "Публикация создана");
      router.push(ROUTES.seller.posts);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить публикацию");
      setIsSaving(false);
    }
  }

  async function handleCoverFile(file: File | undefined) {
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadImage(file);
      setCoverImage(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить изображение");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">Содержание</h2>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Заголовок</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Как создаётся керамическая чашка"
            className="bg-background focus:ring-primary/30 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Описание для ленты и поиска</span>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="Коротко, о чём публикация. Этот текст виден в ленте и в поиске."
            className="bg-background focus:ring-primary/30 resize-y rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Полный текст</span>
          <PostEditor value={body} onChange={setBody} />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">URL обложки (необязательно)</span>
          <input
            type="text"
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            placeholder="https://..."
            className="bg-background focus:ring-primary/30 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
        </label>
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
          <input
            type="file"
            accept="image/*"
            disabled={isUploading}
            className="text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void handleCoverFile(file);
            }}
          />
          {isUploading ? "Загрузка..." : "или загрузите файл"}
        </label>
      </section>

      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Прикреплённые товары</h2>
          <button
            type="button"
            onClick={() => setIsPickingProducts(true)}
            className="text-primary flex items-center gap-1 text-xs hover:underline"
          >
            <Plus className="h-3 w-3" />
            Выбрать
          </button>
        </div>

        {selectedProducts.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">
            Товары не прикреплены. Читатели не смогут сразу перейти к покупке.
          </p>
        ) : (
          <div className="flex flex-col divide-y">
            {selectedProducts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <div className="bg-muted relative h-10 w-10 shrink-0 overflow-hidden rounded-md">
                  <Image src={p.image} alt={p.title} fill sizes="40px" className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.title}</div>
                  <div className="text-muted-foreground text-xs">{formatPrice(p.price)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleProduct(p)}
                  className="hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-md p-1.5"
                  aria-label="Убрать товар"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            "rounded-lg px-5 py-2.5 text-sm font-medium transition-colors",
            isSaving
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {isSaving ? "Сохранение..." : isEdit ? "Сохранить" : "Опубликовать"}
        </button>
        <button
          type="button"
          onClick={() => router.push(ROUTES.seller.posts)}
          className="hover:bg-muted rounded-lg border px-5 py-2.5 text-sm font-medium"
        >
          Отмена
        </button>
      </div>

      {isPickingProducts && (
        <ProductPicker
          products={availableProducts}
          selected={selectedProducts}
          onToggle={toggleProduct}
          onClose={() => setIsPickingProducts(false)}
        />
      )}
    </div>
  );
}

function ProductPicker({
  products,
  selected,
  onToggle,
  onClose,
}: {
  products: Product[];
  selected: Product[];
  onToggle: (p: Product) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold">Выберите товары</h3>
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-muted rounded-md p-1.5"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {products.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              У вас пока нет товаров. Сначала добавьте товар в каталог.
            </p>
          ) : (
            <ul className="flex flex-col">
              {products.map((product) => {
                const isSelected = selected.some((p) => p.id === product.id);
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(product)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors",
                        isSelected ? "bg-primary/10" : "hover:bg-muted"
                      )}
                    >
                      <div className="bg-muted relative h-10 w-10 shrink-0 overflow-hidden rounded-md">
                        <Image
                          src={product.image}
                          alt={product.title}
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{product.title}</div>
                        <div className="text-muted-foreground text-xs">
                          {formatPrice(product.price)}
                        </div>
                      </div>
                      {isSelected && <Check className="text-primary h-4 w-4 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t p-4">
          <button
            type="button"
            onClick={onClose}
            className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-lg px-4 py-2 text-sm font-medium"
          >
            Готово ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}
