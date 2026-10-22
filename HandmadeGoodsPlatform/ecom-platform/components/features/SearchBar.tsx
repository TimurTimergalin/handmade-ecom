"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

import { ROUTES } from "@/lib/constants";

export function SearchBar({
  initialValue = "",
  href,
}: {
  initialValue?: string;
  /** Если задан, поиск остаётся на этом адресе и добавляет `q`. Иначе уходит на общий `/search`. */
  href?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialValue);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      if (!href) return;
      const url = new URL(href, "http://localhost");
      url.searchParams.delete("q");
      const search = url.searchParams.toString();
      router.push(search ? `${url.pathname}?${search}` : url.pathname);
      return;
    }

    if (!href) {
      router.push(`${ROUTES.search}?q=${encodeURIComponent(trimmed)}`);
      return;
    }

    const url = new URL(href, "http://localhost");
    url.searchParams.set("q", trimmed);
    router.push(`${url.pathname}${url.search}`);
  }

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск товаров, мастеров, публикаций..."
        className="bg-background focus:ring-primary/30 w-full rounded-lg border py-2.5 pr-4 pl-10 text-sm outline-none focus:ring-2"
      />
    </form>
  );
}
