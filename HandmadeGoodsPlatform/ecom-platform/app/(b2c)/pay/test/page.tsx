import { Suspense } from "react";

import { TestPayment } from "@/components/features/TestPayment";

export default function TestPaymentPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground px-4 py-10 text-sm">Загрузка оплаты...</div>}>
      <TestPayment />
    </Suspense>
  );
}
