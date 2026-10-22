import Link from "next/link";
import { Check, Circle } from "lucide-react";

import { ROUTES } from "@/lib/constants";

const STEPS = [
  {
    title: "Заполните профиль магазина",
    description: "Имя, аватар и описание — чтобы покупатели узнали вас.",
    href: ROUTES.seller.profile,
    done: true,
  },
  {
    title: "Добавьте первый товар",
    description: "Настройте цену, сток и способ доставки.",
    href: ROUTES.seller.productNew,
    done: false,
  },
  {
    title: "Опубликуйте первый пост",
    description: "Расскажите историю вашего творчества и прикрепите товары.",
    href: ROUTES.seller.postNew,
    done: false,
  },
  {
    title: "Настройте доставку",
    description: "Укажите, где покупатели смогут забрать заказ.",
    href: ROUTES.seller.delivery,
    done: false,
  },
];

export default function OnboardingPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Добро пожаловать!</h1>
        <p className="text-muted-foreground mt-2">
          Давайте настроим ваш магазин. Это займёт пару минут.
        </p>
      </div>

      <div className="bg-card flex flex-col gap-1 rounded-xl border p-4">
        {STEPS.map((step, idx) => (
          <Link
            key={step.title}
            href={step.href}
            className="hover:bg-muted/50 flex gap-3 rounded-lg p-3 transition-colors"
          >
            <div className="mt-0.5 shrink-0">
              {step.done ? (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white">
                  <Check className="h-3 w-3" />
                </div>
              ) : (
                <Circle className="text-muted-foreground h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {idx + 1}. {step.title}
              </div>
              <div className="text-muted-foreground mt-0.5 text-xs">{step.description}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="flex gap-3">
        <Link
          href={ROUTES.seller.dashboard}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-2.5 text-sm font-medium"
        >
          Перейти в кабинет
        </Link>
      </div>
    </div>
  );
}
