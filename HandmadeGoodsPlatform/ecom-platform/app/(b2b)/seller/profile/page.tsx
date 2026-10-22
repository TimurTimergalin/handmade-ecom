import { SellerProfileForm } from "@/components/features/SellerProfileForm";

export default function SellerProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Профиль магазина</h1>
        <p className="text-muted-foreground mt-1 text-sm">Как вас видят покупатели</p>
      </div>
      <SellerProfileForm />
    </div>
  );
}
