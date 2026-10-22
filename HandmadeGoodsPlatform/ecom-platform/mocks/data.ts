import type { Post, Product, Seller, User, Order } from "@/types";

// ============================================================
// Продавцы
// ============================================================

export const CURRENT_SELLER_ID = "s1";

export const MOCK_SELLERS: Seller[] = [
  {
    id: "s1",
    username: "keramika_ann",
    displayName: "Анна Керамика",
    avatar: "/placeholders/avatar.svg",
    bio: "Создаю керамическую посуду ручной работы. Каждая чашка — уникальна.",
    followersCount: 1240,
    isFollowing: false,
    rating: 4.9,
    productsCount: 12,
    postsCount: 8,
    joinedAt: "2024-03-15T10:00:00Z",
  },
  {
    id: "s2",
    username: "woodcraft_max",
    displayName: "Максим Дерево",
    avatar: "/placeholders/avatar.svg",
    bio: "Деревянные изделия для дома и кухни. Работаю с массивом дуба и ясеня.",
    followersCount: 890,
    isFollowing: true,
    rating: 4.7,
    productsCount: 7,
    postsCount: 5,
    joinedAt: "2024-06-20T10:00:00Z",
  },
  {
    id: "s3",
    username: "wool_magic",
    displayName: "Ольга Вязание",
    avatar: "/placeholders/avatar.svg",
    bio: "Вяжу из натуральной шерсти. Свитера, шапки, шарфы — тёплые и уютные.",
    followersCount: 2100,
    isFollowing: false,
    rating: 4.8,
    productsCount: 20,
    postsCount: 15,
    joinedAt: "2023-11-01T10:00:00Z",
  },
];

// ============================================================
// Товары
// ============================================================

export const MOCK_PRODUCTS: Product[] = [
  {
    id: "p1",
    title: "Керамическая чашка «Утро»",
    description: "Ручная лепка, глазурь небесного цвета. Объём 300 мл.",
    image: "/placeholders/product.svg",
    price: 1800,
    currency: "RUB",
    sellerId: "s1",
    seller: MOCK_SELLERS[0],
    saleMode: "online",
    availableDeliveries: ["pickup", "cdek"],
    pickupPoints: [{ city: "Москва", address: "ул. Ленина, д. 5, кв. 12" }],
    inStock: 5,
    createdAt: "2026-09-01T10:00:00Z",
  },
  {
    id: "p2",
    title: "Керамическая тарелка «Море»",
    description: "Декоративная тарелка с ручной росписью. Диаметр 25 см.",
    image: "/placeholders/product.svg",
    price: 3200,
    currency: "RUB",
    sellerId: "s1",
    seller: MOCK_SELLERS[0],
    saleMode: "online",
    availableDeliveries: ["cdek"],
    inStock: 2,
    createdAt: "2026-09-05T10:00:00Z",
  },
  {
    id: "p3",
    title: "Деревянная разделочная доска",
    description: "Массив дуба, покрытие льняным маслом. 30×20 см.",
    image: "/placeholders/product.svg",
    price: 2500,
    currency: "RUB",
    sellerId: "s2",
    seller: MOCK_SELLERS[1],
    saleMode: "online",
    availableDeliveries: ["cdek"],
    inStock: 8,
    createdAt: "2026-09-10T10:00:00Z",
  },
  {
    id: "p4",
    title: "Шерстяной свитер «Север»",
    description: "100% овечья шерсть, ручная вязка. Размер M.",
    image: "/placeholders/product.svg",
    price: 6500,
    currency: "RUB",
    sellerId: "s3",
    seller: MOCK_SELLERS[2],
    saleMode: "out_of_stock",
    availableDeliveries: ["pickup"],
    pickupPoints: [
      { city: "Москва", address: "ул. Ленина, д. 5, кв. 12" },
      { city: "Москва", address: "ул. Пушкина, д. 10, офис 3" },
    ],
    inStock: 0,
    createdAt: "2026-08-15T10:00:00Z",
  },
  {
    id: "p5",
    title: "Керамическая ваза «Закат»",
    description: "Авторская работа. Продаётся только по сделке — свяжитесь с продавцом.",
    image: "/placeholders/product.svg",
    price: 4500,
    currency: "RUB",
    sellerId: "s1",
    seller: MOCK_SELLERS[0],
    saleMode: "deal_only",
    availableDeliveries: ["pickup"],
    pickupPoints: [{ city: "Москва", address: "ул. Ленина, д. 5, кв. 12" }],
    dealContacts: "Telegram: @keramika_ann, WhatsApp: +7 999 123-45-67",
    inStock: 1,
    createdAt: "2026-09-20T10:00:00Z",
  },
];

// ============================================================
// Посты
// ============================================================

export const MOCK_POSTS: Post[] = [
  {
    id: "post1",
    sellerId: "s1",
    seller: MOCK_SELLERS[0],
    title: "Как рождается керамическая чашка",
    body: "Сегодня хочу рассказать, как создаётся каждая чашка. Всё начинается с куска глины... Процесс занимает несколько дней: лепка, сушка, обжиг, глазуровка и финальный обжиг. Каждая чашка уникальна, как и её будущий владелец.",
    coverImage: "/placeholders/post-cover.svg",
    products: [MOCK_PRODUCTS[0], MOCK_PRODUCTS[1]],
    createdAt: "2026-10-08T14:30:00Z",
    likesCount: 42,
    commentsCount: 7,
    isLiked: false,
  },
  {
    id: "post2",
    sellerId: "s2",
    seller: MOCK_SELLERS[1],
    title: "Дуб и ясень — мои любимые материалы",
    body: "Работаю с деревом уже 5 лет. Дуб — твёрдый, долговечный, с красивой текстурой. Ясень — светлый, упругий. Показываю новую партию разделочных досок.",
    coverImage: "/placeholders/post-cover.svg",
    products: [MOCK_PRODUCTS[2]],
    createdAt: "2026-10-07T10:00:00Z",
    likesCount: 28,
    commentsCount: 3,
    isLiked: true,
  },
  {
    id: "post3",
    sellerId: "s3",
    seller: MOCK_SELLERS[2],
    title: "Тёплый свитер к зиме",
    body: "Связала новый свитер из овечьей шерсти. Мягкий, тёплый, не колется. К сожалению, уже продан, но могу связать похожий под заказ. Пишите!",
    coverImage: "/placeholders/post-cover.svg",
    products: [MOCK_PRODUCTS[3]],
    createdAt: "2026-10-06T18:00:00Z",
    likesCount: 95,
    commentsCount: 12,
    isLiked: false,
  },
];

// ============================================================
// Покупатель
// ============================================================

export const MOCK_BUYER: User = {
  id: "u1",
  username: "test_buyer",
  displayName: "Тестовый Покупатель",
  avatar: "/placeholders/avatar.svg",
  roles: ["buyer"],
  bio: "Люблю уникальные вещи ручной работы",
  email: "buyer@example.com",
  createdAt: "2025-01-01T10:00:00Z",
};

// ============================================================
// Заказы
// ============================================================

export const MOCK_ORDERS: Order[] = [
  {
    id: "ord1",
    createdAt: "2026-10-01T12:00:00Z",
    status: "delivered",
    buyer: MOCK_BUYER,
    seller: MOCK_SELLERS[0],
    items: [{ product: MOCK_PRODUCTS[0], quantity: 1 }],
    delivery: "cdek",
    total: 1800,
  },
  {
    id: "ord2",
    createdAt: "2026-10-05T15:30:00Z",
    status: "shipped",
    buyer: MOCK_BUYER,
    seller: MOCK_SELLERS[1],
    items: [{ product: MOCK_PRODUCTS[2], quantity: 2 }],
    delivery: "cdek",
    total: 5000,
  },
];
