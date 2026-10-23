"use client";

import { useEffect, useId, useRef } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { b2cOrigin } from "@/lib/axios";

export interface CdekOfficeSelection {
  code: string;
  address: string;
  city?: string;
}

const MAPS_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY?.trim() ?? "";
const GEOCODER_KEY = process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY?.trim() ?? "";

function installGeocoderKey() {
  if (!GEOCODER_KEY || typeof window === "undefined") return;
  const flag = "__handmadeGeocoderKey";
  const host = window as Window & { [flag]?: boolean };
  if (host[flag]) return;
  host[flag] = true;

  const rewrite = (url: string) => {
    if (!url.includes("geocode-maps.yandex.ru")) return url;
    const parsed = new URL(url);
    parsed.searchParams.set("apikey", GEOCODER_KEY);
    parsed.pathname = parsed.pathname.replace("/1.x/", "/v1/");
    return parsed.toString();
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ) {
    const next = typeof url === "string" ? rewrite(url) : url;
    return originalOpen.call(this, method, next, async ?? true, username, password);
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") return originalFetch(rewrite(input), init);
    if (input instanceof URL) return originalFetch(rewrite(input.toString()), init);
    if (input instanceof Request && input.url.includes("geocode-maps.yandex.ru")) {
      return originalFetch(new Request(rewrite(input.url), input), init);
    }
    return originalFetch(input, init);
  };
}

export function CdekWidget({
  open,
  onOpenChange,
  onSelect,
  sender = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (office: CdekOfficeSelection) => void;
  /** Кабинет продавца выбирает пункт отгрузки. Покупатель — пункт выдачи. */
  sender?: boolean;
}) {
  const rootId = `cdek-widget-${useId().replace(/:/g, "")}`;
  const onSelectRef = useRef(onSelect);
  const onOpenChangeRef = useRef(onOpenChange);
  onSelectRef.current = onSelect;
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open || !MAPS_KEY) return;
    installGeocoderKey();
    let cancelled = false;
    let widget: { close: () => void; destroy: () => void; open: () => void } | null = null;

    (async () => {
      const imported = await import("@cdek-it/widget");
      if (cancelled) return;
      const options = {
        apiKey: MAPS_KEY,
        popup: true,
        sender,
        canChoose: true,
        servicePath: `${b2cOrigin.replace(/\/$/, "")}/api/cdek/service`,
        defaultLocation: "Москва",
        root: rootId,
        hideDeliveryOptions: { door: true, office: false },
        onChoose: (_mode: string, _tariff: unknown, target: { code?: string; city?: string; address?: string }) => {
          const code = target?.code?.trim() ?? "";
          if (!code) return;
          const city = target.city?.trim() ?? "";
          const address = [city, target.address?.trim()].filter(Boolean).join(", ") || code;
          onSelectRef.current({ code, address, city });
          widget?.close();
          onOpenChangeRef.current(false);
        },
      };
      widget = new imported.default(
        options as unknown as ConstructorParameters<typeof imported.default>[0]
      );
      widget.open();
    })().catch(() => {
      onOpenChangeRef.current(false);
    });

    return () => {
      cancelled = true;
      widget?.destroy();
    };
  }, [open, rootId, sender]);

  if (!MAPS_KEY) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Пункт СДЭК</DialogTitle>
            <DialogDescription>
              {sender
                ? "Чтобы выбрать пункт отгрузки, нужен ключ Яндекс Карт."
                : "Чтобы выбрать пункт выдачи, нужен ключ Яндекс Карт."}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return <div id={rootId} />;
}
