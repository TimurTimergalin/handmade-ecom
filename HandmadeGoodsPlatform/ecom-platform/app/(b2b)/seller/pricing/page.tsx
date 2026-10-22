import { PricingPlans } from "@/components/features/PricingPlans";

export default function PricingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Тарифы</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Выберите план, который подходит вашему магазину
        </p>
      </div>
      <PricingPlans currentTier="free" />
    </div>
  );
}
