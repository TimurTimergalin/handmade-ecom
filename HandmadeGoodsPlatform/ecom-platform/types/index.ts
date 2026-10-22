// ============================================================
// Пользователи
// ============================================================

export type UserRole = "buyer" | "seller";

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  roles: UserRole[];
  bio?: string;
  email?: string;
  createdAt: string;
}

export interface Seller {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  bio?: string;
  followersCount: number;
  isFollowing: boolean;
  rating: number;
  productsCount: number;
  postsCount: number;
  joinedAt: string;
}

// ============================================================
// Товары
// ============================================================

export type DeliveryMethod = "pickup" | "cdek";
export type SaleMode = "online" | "out_of_stock" | "deal_only";

export interface PickupPoint {
  city: string;
  address: string;
}

export interface Product {
  id: string;
  title: string;
  description?: string;
  image: string;
  price: number;
  currency: "RUB";
  sellerId: string;
  seller: Seller;
  saleMode: SaleMode;
  availableDeliveries: DeliveryMethod[];
  pickupPoints?: PickupPoint[];
  dealContacts?: string;
  inStock: number;
  createdAt: string;
}

// ============================================================
// Посты (соцсеть)
// ============================================================

export interface Post {
  id: string;
  sellerId: string;
  seller: Seller;
  title: string;
  summary: string;
  body: string;
  coverImage?: string;
  products: Product[];
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
}

// ============================================================
// Корзина
// ============================================================

export interface CartItem {
  productId: string;
  quantity: number;
  delivery: DeliveryMethod;
}

export interface CartGroup {
  key: string; // `${sellerId}__${delivery}`
  seller: Seller;
  delivery: DeliveryMethod;
  items: CartItem[]; // доступные к заказу
  unavailableItems: CartItem[]; // закончившиеся / deal_only
}

// ============================================================
// Заказы
// ============================================================

export type OrderStatus = "created" | "paid" | "shipped" | "delivered" | "cancelled";

export interface OrderItem {
  product: Product;
  quantity: number;
}

export interface Order {
  id: string;
  createdAt: string;
  status: OrderStatus;
  buyer: User;
  seller: Seller;
  items: OrderItem[];
  delivery: DeliveryMethod;
  pickupPoint?: PickupPoint;
  trackingNumber?: string;
  total: number;
}

// ============================================================
// Тарифы
// ============================================================

export type PlanTier = "free" | "premium";

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface Plan {
  tier: PlanTier;
  name: string;
  price: number;
  features: PlanFeature[];
}

// ============================================================
// Утилитарные типы
// ============================================================

export type Nullable<T> = T | null;

export interface ApiResponse<T> {
  data: T;
  error: null | { code: string; message: string };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
