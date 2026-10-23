import Link from "next/link";

const SECTIONS = [
  {
    href: "/moderation/shops",
    title: "Новые магазины",
    text: "Заявки на открытие магазина",
  },
  {
    href: "/moderation/profiles",
    title: "Изменения профиля",
    text: "Название, описание и аватар",
  },
  {
    href: "/moderation/products",
    title: "Товары",
    text: "Новые товары и правки уже опубликованных",
  },
  {
    href: "/moderation/posts",
    title: "Публикации",
    text: "Новые публикации и правки уже вышедших",
  },
];

export default function ModerationHomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Модерация</h1>
      <div className="grid gap-3">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="bg-card hover:bg-muted/40 rounded-xl border p-4"
          >
            <div className="font-medium">{section.title}</div>
            <p className="text-muted-foreground mt-1 text-sm">{section.text}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
