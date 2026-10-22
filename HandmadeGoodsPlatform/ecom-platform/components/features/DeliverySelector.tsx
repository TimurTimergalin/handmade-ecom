"use client";

import { MapPin, Truck } from "lucide-react";

import { DELIVERY_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DeliveryMethod } from "@/types";

export function DeliverySelector({
  available,
  value,
  onChange,
}: {
  available: DeliveryMethod[];
  value: DeliveryMethod;
  onChange: (d: DeliveryMethod) => void;
}) {
  if (available.length <= 1) {
    return null; // один способ — выбор не нужен
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium">Способ получения</div>
      <div className="flex flex-wrap gap-2">
        {available.map((method) => {
          const isActive = value === method;
          const Icon = method === "pickup" ? MapPin : Truck;

          return (
            <button
              key={method}
              type="button"
              onClick={() => onChange(method)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors",
                isActive
                  ? "border-primary bg-primary/5 text-foreground"
                  : "hover:bg-muted text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {DELIVERY_LABELS[method]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
