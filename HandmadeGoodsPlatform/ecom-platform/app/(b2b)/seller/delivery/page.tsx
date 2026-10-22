import { DeliverySettingsForm } from "@/components/features/DeliverySettingsForm";

export default function DeliverySettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Доставка</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Настройте способы, которыми покупатели могут получить ваш товар
        </p>
      </div>
      <DeliverySettingsForm />
    </div>
  );
}
