"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getPayoutWidget, savePayoutToken, type PayoutCard } from "@/services/api";

const SCRIPT_SRC = "https://yookassa.ru/payouts-data/3.1.0/widget.js";
const FORM_ID = "yookassa-payout-form";

const WIDGET_ERRORS: Record<string, string> = {
  card_country_code_error: "На карту из этой страны выплату сделать нельзя. Укажите другую.",
  card_not_suitable_for_payout_error: "Эта карта не подходит для выплаты. Укажите другую.",
  card_unknown_country_code_error: "ЮKassa не распознала номер карты. Введите его ещё раз.",
  internal_service_error: "ЮKassa не смогла обработать карту. Попробуйте ещё раз.",
  unknown_merchant_id_error: "ЮKassa не узнала магазин. Проверьте идентификатор тестового магазина.",
};

type PayoutSuccess = {
  payout_token?: string;
  last4?: string;
  issuer_name?: string;
  card_type?: string;
};

type PayoutsWidget = {
  render: (id: string) => Promise<void>;
  clearListeners: () => void;
};

declare global {
  interface Window {
    PayoutsData?: new (options: {
      type: "safedeal";
      account_id: string;
      lang?: string;
      success_callback: (data: PayoutSuccess) => void;
      error_callback: (error: unknown) => void;
    }) => PayoutsWidget;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadPayoutsScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.PayoutsData) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("Не удалось загрузить виджет ЮKassa"));
      };
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

function errorCode(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; error?: unknown };
    if (typeof record.code === "string") return record.code;
    if (typeof record.error === "string") return record.error;
  }
  return "internal_service_error";
}

function cardFrom(data: PayoutSuccess): PayoutCard {
  return {
    last4: data.last4 ?? "",
    cardType: data.card_type ?? "",
    issuerName: data.issuer_name ?? "",
  };
}

export function PayoutCardWidget({
  required,
  linked,
  card,
  onChange,
}: {
  required: boolean;
  linked: boolean;
  card: PayoutCard | null;
  onChange: (next: { linked: boolean; card: PayoutCard | null }) => void;
}) {
  const [shopId, setShopId] = useState<string | null>(null);
  const [configError, setConfigError] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [widgetError, setWidgetError] = useState("");
  const showForm = !linked || replacing;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    getPayoutWidget()
      .then((config) => {
        if (cancelled) return;
        setShopId(config.shopId || "");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setConfigError(error instanceof Error ? error.message : "Не удалось получить настройки оплаты");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showForm || !shopId) return;
    let cancelled = false;
    const holder: { widget: PayoutsWidget | null } = { widget: null };

    loadPayoutsScript()
      .then(() => {
        if (cancelled || !window.PayoutsData) return;
        const widget = new window.PayoutsData({
          type: "safedeal",
          account_id: shopId,
          lang: "ru_RU",
          success_callback: (data) => {
            const token = data.payout_token?.trim() ?? "";
            if (!token) {
              setWidgetError("ЮKassa не вернула токен карты");
              return;
            }
            const nextCard = cardFrom(data);
            setSaving(true);
            setWidgetError("");
            savePayoutToken(token, nextCard)
              .then(() => {
                setReplacing(false);
                onChangeRef.current({ linked: true, card: nextCard });
                toast.success("Карта для выплат сохранена");
              })
              .catch((error: unknown) => {
                toast.error(error instanceof Error ? error.message : "Не удалось сохранить карту");
              })
              .finally(() => setSaving(false));
          },
          error_callback: (error) => {
            const code = errorCode(error);
            setWidgetError(WIDGET_ERRORS[code] ?? "ЮKassa отклонила карту. Попробуйте другую.");
          },
        });
        holder.widget = widget;
        if (cancelled) {
          widget.clearListeners();
          return;
        }
        return widget.render(FORM_ID);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setWidgetError(error instanceof Error ? error.message : "Не удалось показать форму ЮKassa");
      });

    return () => {
      cancelled = true;
      holder.widget?.clearListeners();
    };
  }, [shopId, showForm]);

  async function unlink() {
    setSaving(true);
    try {
      await savePayoutToken("");
      setReplacing(false);
      onChange({ linked: false, card: null });
      toast.success("Карта отвязана");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отвязать карту");
    } finally {
      setSaving(false);
    }
  }

  const mask = card?.last4 ? `•••• ${card.last4}` : "";
  const title = [card?.cardType, mask].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs">
        Карта для выплат ЮKassa{required ? " *" : ""}
      </span>
      {linked && (
        <div className="bg-background flex items-center justify-between gap-3 rounded-md border px-3 py-2">
          <div className="min-w-0">
            <div className="text-sm">{title || "Карта привязана"}</div>
            {card?.issuerName ? (
              <div className="text-muted-foreground truncate text-xs">{card.issuerName}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => {
                setWidgetError("");
                setReplacing(true);
              }}
              disabled={saving}
              className="rounded-md border px-2 py-1 text-xs"
            >
              Заменить
            </button>
            {!required && (
              <button
                type="button"
                onClick={() => void unlink()}
                disabled={saving}
                className="rounded-md border px-2 py-1 text-xs"
              >
                Отвязать
              </button>
            )}
          </div>
        </div>
      )}
      {configError && <span className="text-destructive text-xs">{configError}</span>}
      {!configError && shopId === "" && (
        <span className="text-muted-foreground text-xs">
          Виджет не настроен: в окружении нет идентификатора магазина ЮKassa.
        </span>
      )}
      {showForm && shopId && (
        <div id={FORM_ID} className="min-h-72 overflow-hidden rounded-md border bg-white" />
      )}
      {saving && <span className="text-muted-foreground text-xs">Сохраняем карту...</span>}
      {widgetError && <span className="text-destructive text-xs">{widgetError}</span>}
      <span className="text-muted-foreground text-xs">
        Номер карты вводится в форме ЮKassa. Магазин получает только токен и маску, полный номер не
        сохраняется.
        {required
          ? " На Premium карта обязательна: без неё нельзя продавать в наличии."
          : " На Free карту можно не привязывать."}
      </span>
    </div>
  );
}
