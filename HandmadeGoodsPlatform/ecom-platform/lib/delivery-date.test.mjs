import assert from "node:assert/strict";

import {
  formatCdekShipmentLabel,
  formatPickupReadyLabel,
  formatSnippetDeliveryLabel,
} from "./delivery-date.ts";

// Четверг, 22 октября 2026. Пятница СДЭК — индекс 4 (0 понедельник … 6 воскресенье).
const thursday = new Date(2026, 9, 22);
const friday = 4;

const cases = [
  {
    name: "только самовывоз, 2 дня",
    product: {
      availableDeliveries: ["pickup"],
      pickupPoints: [{ city: "Москва", address: "ул. Ленина", maxDays: 2 }],
    },
    snippet: "24 октября",
    pickup: "24 октября",
    cdek: null,
  },
  {
    name: "только СДЭК в пятницу, сегодня четверг",
    product: {
      availableDeliveries: ["cdek"],
      cdekShipDays: [friday],
    },
    snippet: "от 23 октября",
    pickup: null,
    cdek: "от 23 октября",
  },
  {
    name: "оба, СДЭК раньше",
    product: {
      availableDeliveries: ["pickup", "cdek"],
      pickupPoints: [{ maxDays: 2 }],
      cdekShipDays: [friday],
    },
    snippet: "от 23 октября",
    pickup: "24 октября",
    cdek: "от 23 октября",
  },
  {
    name: "оба, самовывоз раньше",
    product: {
      availableDeliveries: ["cdek", "pickup"],
      pickupPoints: [{ maxDays: 0 }],
      cdekShipDays: [friday],
    },
    snippet: "сегодня",
    pickup: "сегодня",
    cdek: "от 23 октября",
  },
  {
    name: "один день",
    product: {
      availableDeliveries: ["pickup", "cdek"],
      pickupPoints: [{ maxDays: 1 }],
      cdekShipDays: [friday],
    },
    snippet: "завтра",
    pickup: "завтра",
    cdek: "от 23 октября",
  },
  {
    name: "СДЭК сегодня",
    product: {
      availableDeliveries: ["cdek"],
      cdekShipDays: [3],
    },
    snippet: "от 22 октября",
    pickup: null,
    cdek: "от 22 октября",
  },
];

for (const item of cases) {
  assert.equal(formatSnippetDeliveryLabel(item.product, thursday), item.snippet, item.name);
  assert.equal(
    formatPickupReadyLabel(item.product, thursday),
    item.pickup,
    `${item.name}: самовывоз`
  );
  assert.equal(formatCdekShipmentLabel(item.product, thursday), item.cdek, `${item.name}: СДЭК`);
  console.log(`${item.name}: ${item.snippet}`);
}

assert.equal(
  formatSnippetDeliveryLabel(
    { availableDeliveries: ["pickup", "cdek"], pickupPoints: [{ maxDays: undefined }] },
    thursday
  ),
  "Самовывоз · СДЭК"
);

const untouched = new Date(thursday.getTime());
formatSnippetDeliveryLabel(cases[0].product, untouched);
assert.equal(untouched.getTime(), thursday.getTime());

console.log("ok");
