"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import { CdekWidget } from "@/components/features/CdekWidget";
import { getDeliverySettings, updateDeliverySettings } from "@/services/api";
import type { PickupPoint } from "@/types";

const WEEKDAYS: { day: number; label: string }[] = [
  { day: 0, label: "Пн" },
  { day: 1, label: "Вт" },
  { day: 2, label: "Ср" },
  { day: 3, label: "Чт" },
  { day: 4, label: "Пт" },
  { day: 5, label: "Сб" },
  { day: 6, label: "Вс" },
];

function isPickupMaxDays(value: number | undefined): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 365;
}

function Toggle({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? "bg-primary" : "bg-foreground/20"
      }`}
    >
      <span
        className={`bg-background absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow-sm transition-transform ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

interface FormState {
  pickupEnabled: boolean;
  pickupPoints: PickupPoint[];
  cdekEnabled: boolean;
  cdekOfficeCode: string;
  cdekOfficeAddress: string;
  cdekShipDays: number[];
}

export function DeliverySettingsForm() {
  const [form, setForm] = useState<FormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [cdekWidgetOpen, setCdekWidgetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDeliverySettings()
      .then((settings) => {
        if (cancelled) return;
        setForm({
          pickupEnabled: settings.pickupEnabled,
          pickupPoints: settings.pickupPoints ?? [],
          cdekEnabled: settings.cdekEnabled,
          cdekOfficeCode: settings.cdekOfficeCode ?? "",
          cdekOfficeAddress: settings.cdekOfficeAddress ?? "",
          cdekShipDays: settings.cdekShipDays ?? [],
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : "Не удалось загрузить доставку");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(key: "pickupEnabled" | "cdekEnabled") {
    setForm((current) => (current ? { ...current, [key]: !current[key] } : current));
  }

  function addPoint() {
    setForm((current) =>
      current
        ? {
            ...current,
            pickupPoints: [...current.pickupPoints, { city: "", address: "", maxDays: undefined }],
          }
        : current
    );
  }

  function updatePoint(idx: number, patch: Partial<PickupPoint>) {
    setForm((current) =>
      current
        ? {
            ...current,
            pickupPoints: current.pickupPoints.map((point, i) =>
              i === idx ? { ...point, ...patch } : point
            ),
          }
        : current
    );
  }

  function toggleShipDay(day: number) {
    setForm((current) => {
      if (!current) return current;
      const selected = current.cdekShipDays.includes(day)
        ? current.cdekShipDays.filter((item) => item !== day)
        : [...current.cdekShipDays, day].sort((left, right) => left - right);
      return { ...current, cdekShipDays: selected };
    });
  }

  function removePoint(idx: number) {
    setForm((current) =>
      current
        ? { ...current, pickupPoints: current.pickupPoints.filter((_, i) => i !== idx) }
        : current
    );
  }

  async function handleSave() {
    if (!form) return;
    if (form.pickupEnabled && form.pickupPoints.length === 0) {
      toast.error("Добавьте адрес самовывоза");
      return;
    }
    if (form.pickupEnabled && form.pickupPoints.some((p) => !p.city.trim() || !p.address.trim())) {
      toast.error("Заполните все адреса самовывоза");
      return;
    }
    if (form.pickupEnabled && form.pickupPoints.some((p) => !isPickupMaxDays(p.maxDays))) {
      toast.error("Укажите срок самовывоза целым числом от 0 до 365");
      return;
    }
    if (form.cdekEnabled && !form.cdekOfficeCode.trim()) {
      toast.error("Выберите пункт отгрузки СДЭК");
      return;
    }
    if (form.cdekEnabled && !form.cdekOfficeAddress.trim()) {
      toast.error("У пункта отгрузки СДЭК нет адреса");
      return;
    }
    if (form.cdekEnabled && form.cdekShipDays.length === 0) {
      toast.error("Выберите хотя бы один день отгрузки СДЭК");
      return;
    }

    setIsSaving(true);
    try {
      const saved = await updateDeliverySettings({
        pickupEnabled: form.pickupEnabled,
        cdekEnabled: form.cdekEnabled,
        pickupPoints: form.pickupEnabled
          ? form.pickupPoints.map((point) => ({
              city: point.city.trim(),
              address: point.address.trim(),
              maxDays: point.maxDays as number,
            }))
          : [],
        ...(form.cdekEnabled
          ? {
              cdekOfficeCode: form.cdekOfficeCode.trim(),
              cdekOfficeAddress: form.cdekOfficeAddress.trim(),
              cdekShipDays: form.cdekShipDays,
            }
          : {}),
      });
      setForm({
        pickupEnabled: saved.pickupEnabled,
        pickupPoints: saved.pickupPoints ?? [],
        cdekEnabled: saved.cdekEnabled,
        cdekOfficeCode: saved.cdekOfficeCode ?? "",
        cdekOfficeAddress: saved.cdekOfficeAddress ?? "",
        cdekShipDays: saved.cdekShipDays ?? [],
      });
      toast.success("Настройки сохранены");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить настройки");
    } finally {
      setIsSaving(false);
    }
  }

  if (!form) {
    return <div className="text-muted-foreground text-sm">Загрузка настроек...</div>;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Самовывоз</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">Покупатели забирают товар сами</p>
          </div>
          <Toggle
            on={form.pickupEnabled}
            label="Самовывоз"
            onClick={() => toggle("pickupEnabled")}
          />
        </div>

        {form.pickupEnabled && (
          <div className="flex flex-col gap-2 border-t pt-3">
            <div className="text-muted-foreground text-xs">Адреса точек самовывоза</div>
            {form.pickupPoints.map((point, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <input
                  value={point.city}
                  onChange={(e) => updatePoint(idx, { city: e.target.value })}
                  placeholder="Город"
                  className="bg-background w-32 rounded-md border px-3 py-2 text-sm outline-none"
                />
                <input
                  value={point.address}
                  onChange={(e) => updatePoint(idx, { address: e.target.value })}
                  placeholder="Адрес"
                  className="bg-background flex-1 rounded-md border px-3 py-2 text-sm outline-none"
                />
                <input
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  value={point.maxDays ?? ""}
                  onChange={(e) =>
                    updatePoint(idx, {
                      maxDays: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  placeholder="Максимум, дней"
                  aria-label="Максимум, дней"
                  className="bg-background w-40 rounded-md border px-3 py-2 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => removePoint(idx)}
                  className="hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-md p-2"
                  aria-label="Удалить адрес"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addPoint}
              className="text-primary flex items-center gap-1.5 self-start text-xs hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить адрес
            </button>
          </div>
        )}
      </section>

      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">СДЭК</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">Отправка через курьерскую службу</p>
          </div>
          <Toggle on={form.cdekEnabled} label="СДЭК" onClick={() => toggle("cdekEnabled")} />
        </div>
        {form.cdekEnabled && (
          <div className="flex flex-col gap-3 border-t pt-3">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setCdekWidgetOpen(true)}
                className="text-primary self-start text-xs hover:underline"
              >
                Выбрать пункт отгрузки
              </button>
              {form.cdekOfficeCode ? (
                <p className="text-sm">
                  {form.cdekOfficeAddress}
                  <span className="text-muted-foreground"> · {form.cdekOfficeCode}</span>
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">Пункт отгрузки не выбран</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-muted-foreground text-xs">Дни отгрузки</div>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(({ day, label }) => {
                  const checked = form.cdekShipDays.includes(day);
                  return (
                    <label key={day} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleShipDay(day)}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>
            <CdekWidget
              open={cdekWidgetOpen}
              onOpenChange={setCdekWidgetOpen}
              onSelect={(office) =>
                setForm((current) =>
                  current
                    ? {
                        ...current,
                        cdekOfficeCode: office.code,
                        cdekOfficeAddress: office.address,
                      }
                    : current
                )
              }
            />
          </div>
        )}
      </section>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {isSaving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
