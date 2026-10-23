"use client";

import { MapPin, Truck } from "lucide-react";

import { DELIVERY_LABELS } from "@/lib/constants";
import { formatCdekShipmentLabel, formatPickupReadyLabel } from "@/lib/delivery-date";
import { useAuthStore } from "@/store/auth";
import type { Product } from "@/types";

export const CDEK_PHONE_HINT = "СДЭК недоступен без номера телефона в Яндекс ID";

export function DeliveryBlock({ product }: { product: Product }) {
  const phone = useAuthStore((state) => state.user?.phone);
  const hasPhone = Boolean(phone?.trim());
  const hasPickup = product.availableDeliveries.includes("pickup");
  const hasCdek = product.availableDeliveries.includes("cdek");
  const now = new Date();
  const pickupDate = formatPickupReadyLabel(product, now);
  const cdekDate = formatCdekShipmentLabel(product, now);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      {hasCdek && (
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-2">
            <Truck className="text-muted-foreground h-4 w-4" />
            <span>
              {DELIVERY_LABELS.cdek}
              {cdekDate ? ` · ${cdekDate}` : ""}
            </span>
          </div>
          {!hasPhone && <p className="text-orange-600 pl-6">{CDEK_PHONE_HINT}</p>}
        </div>
      )}

      {hasPickup && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="text-muted-foreground h-4 w-4" />
            <span>
              {DELIVERY_LABELS.pickup}
              {pickupDate ? ` · ${pickupDate}` : ""}
            </span>
          </div>
          {product.pickupPoints && (
            <ul className="text-muted-foreground flex flex-col gap-1.5 pl-6 text-sm">
              {product.pickupPoints.map((point, idx) => (
                <li key={idx} className="flex gap-2">
                  <span className="text-foreground shrink-0 font-medium">{point.city}:</span>
                  <span>{point.address}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
