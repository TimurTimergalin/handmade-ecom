import { MapPin, Truck } from "lucide-react";

import { DELIVERY_LABELS } from "@/lib/constants";
import type { Product } from "@/types";

export function DeliveryBlock({ product }: { product: Product }) {
  const hasPickup = product.availableDeliveries.includes("pickup");
  const hasCdek = product.availableDeliveries.includes("cdek");

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      {hasCdek && (
        <div className="flex items-center gap-2 text-sm">
          <Truck className="text-muted-foreground h-4 w-4" />
          <span>{DELIVERY_LABELS.cdek}</span>
        </div>
      )}

      {hasPickup && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="text-muted-foreground h-4 w-4" />
            <span>{DELIVERY_LABELS.pickup}</span>
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
