"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import { getDeliverySettings, updateDeliverySettings } from "@/services/api";
import type { PickupPoint } from "@/types";

interface FormState {
  pickupEnabled: boolean;
  pickupPoints: PickupPoint[];
  cdekEnabled: boolean;
}

export function DeliverySettingsForm() {
  const [form, setForm] = useState<FormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDeliverySettings()
      .then((settings) => {
        if (cancelled) return;
        setForm({
          pickupEnabled: settings.pickupEnabled,
          pickupPoints: settings.pickupPoints ?? [],
          cdekEnabled: settings.cdekEnabled,
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
        ? { ...current, pickupPoints: [...current.pickupPoints, { city: "", address: "" }] }
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

    setIsSaving(true);
    try {
      const saved = await updateDeliverySettings({
        pickupEnabled: form.pickupEnabled,
        cdekEnabled: form.cdekEnabled,
        pickupPoints: form.pickupEnabled
          ? form.pickupPoints.map((point) => ({
              city: point.city.trim(),
              address: point.address.trim(),
            }))
          : [],
      });
      setForm({
        pickupEnabled: saved.pickupEnabled,
        pickupPoints: saved.pickupPoints ?? [],
        cdekEnabled: saved.cdekEnabled,
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
          <button
            type="button"
            onClick={() => toggle("pickupEnabled")}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              form.pickupEnabled ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                form.pickupEnabled ? "translate-x-5.5" : "translate-x-0.5"
              }`}
            />
          </button>
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
          <button
            type="button"
            onClick={() => toggle("cdekEnabled")}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              form.cdekEnabled ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                form.cdekEnabled ? "translate-x-5.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        {form.cdekEnabled && (
          <p className="text-muted-foreground border-t pt-3 text-xs">
            Интеграция с API СДЭК будет доступна в следующем обновлении.
          </p>
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
