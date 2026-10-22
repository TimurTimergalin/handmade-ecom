"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteProduct } from "@/services/api";
import { ROUTES, SALE_MODE_LABELS, DELIVERY_LABELS } from "@/lib/constants";
import { formatPrice, cn } from "@/lib/utils";
import type { Product, SaleMode } from "@/types";

type Filter = "all" | SaleMode;

export function ProductsManager({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState(products);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = items.filter((p) => {
    const matchesQuery = p.title.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "all" || p.saleMode === filter;
    return matchesQuery && matchesFilter;
  });

  async function handleDelete(id: string) {
    try {
      await deleteProduct(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      toast.success("Товар удалён");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить товар");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={ROUTES.seller.productNew}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Добавить товар
        </Link>

        <div className="relative min-w-[200px] flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию..."
            className="bg-background focus:ring-primary/30 w-full rounded-lg border py-2 pr-3 pl-9 text-sm outline-none focus:ring-2"
          />
        </div>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="bg-background rounded-lg border px-3 py-2 text-sm outline-none"
        >
          <option value="all">Все статусы</option>
          <option value="online">В наличии</option>
          <option value="out_of_stock">Нет в наличии</option>
          <option value="deal_only">По сделке</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card text-muted-foreground rounded-xl border p-12 text-center">
          {items.length === 0 ? "У вас пока нет товаров. Добавьте первый." : "Товары не найдены"}
        </div>
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <ul className="divide-y">
            {filtered.map((product) => (
              <li
                key={product.id}
                className="hover:bg-muted/40 flex items-center gap-4 p-4 transition-colors"
              >
                <div className="bg-muted relative h-14 w-14 shrink-0 overflow-hidden rounded-md">
                  <Image
                    src={product.image}
                    alt={product.title}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{product.title}</div>
                  <div className="text-muted-foreground text-xs">
                    {formatPrice(product.price)} ·{" "}
                    {product.availableDeliveries.map((d) => DELIVERY_LABELS[d]).join(" / ")}
                  </div>
                </div>

                <div className="text-muted-foreground hidden shrink-0 text-right text-xs sm:block">
                  <div>Сток: {product.inStock}</div>
                  <div
                    className={cn(
                      "mt-1 inline-block rounded-full px-2 py-0.5 font-medium",
                      product.saleMode === "online" && "bg-green-100 text-green-800",
                      product.saleMode === "out_of_stock" && "bg-red-100 text-red-800",
                      product.saleMode === "deal_only" && "bg-purple-100 text-purple-800"
                    )}
                  >
                    {SALE_MODE_LABELS[product.saleMode]}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={ROUTES.seller.productEdit(product.id)}
                    className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-md p-2"
                    aria-label="Редактировать"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setDeletingId(product.id)}
                    className="hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-md p-2"
                    aria-label="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {deletingId && (
        <ConfirmDialog
          title="Удалить товар?"
          description="Это действие нельзя отменить."
          onConfirm={() => handleDelete(deletingId)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  title,
  description,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card flex w-full max-w-sm flex-col gap-4 rounded-xl border p-6">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg px-4 py-2 text-sm font-medium"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
