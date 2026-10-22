import type { DeliveryMethod, OrderStatus, SaleMode } from "@/types";

// ============================================================
// Роуты
// ============================================================

export const ROUTES = {
  home: "/",
  search: "/search",
  cart: "/cart",
  checkout: "/checkout",
  login: "/login",
  register: "/register",
  account: "/account",
  orders: "/account/orders",
  orderDetail: (id: string) => `/account/orders/${id}`,
  product: (id: string) => `/product/${id}`,
  post: (id: string) => `/posts/${id}`,
  follow: "/subscriptions",
  sellerPublic: (username: string) => `/shops/${username}`,

  seller: {
    dashboard: "/seller",
    onboarding: "/seller/onboarding",
    pricing: "/seller/pricing",
    products: "/seller/products",
    productNew: "/seller/products/new",
    productEdit: (id: string) => `/seller/products/${id}`,
    posts: "/seller/posts",
    postNew: "/seller/posts/new",
    postEdit: (id: string) => `/seller/posts/${id}`,
    orders: "/seller/orders",
    orderDetail: (id: string) => `/seller/orders/${id}`,
    delivery: "/seller/delivery",
    profile: "/seller/profile",
  },
} as const;

// ============================================================
// Локализованные метки
// ============================================================

export const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  pickup: "Самовывоз",
  cdek: "СДЭК",
};

export const SALE_MODE_LABELS: Record<SaleMode, string> = {
  online: "В наличии",
  out_of_stock: "Нет в наличии",
  deal_only: "По сделке",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  created: "Создан",
  paid: "Оплачен",
  shipped: "Отправлен",
  delivered: "Доставлен",
  cancelled: "Отменён",
};

// ============================================================
// Лимиты тарифов
// ============================================================

export const PLAN_LIMITS = {
  free: {
    products: 10,
    posts: 5,
    commission: 0.1,
    analytics: false,
    priority: false,
  },
  premium: {
    products: Infinity,
    posts: Infinity,
    commission: 0.05,
    analytics: true,
    priority: true,
  },
} as const;

export const PAGINATION = {
  defaultPageSize: 20,
  feedPageSize: 10,
} as const;

// ============================================================
// Прочее
// ============================================================

export const APP_NAME = "Handmade";
export const APP_DESCRIPTION = "Платформа для ручной работы: контент и покупки в одном месте";

export const LOCALE = "ru-RU";
export const CURRENCY = "RUB";
