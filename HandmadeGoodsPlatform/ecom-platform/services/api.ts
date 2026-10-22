import type { AxiosResponse } from "axios";

import { b2b, b2c, isNotFound, readData } from "@/lib/axios";
import type {
  ApiResponse,
  DeliveryMethod,
  Order,
  OrderStatus,
  Paginated,
  PickupPoint,
  Post,
  Product,
  SaleMode,
  Seller,
} from "@/types";

const AVATAR_FALLBACK = "https://ui-avatars.com/api/?name=U&background=6b7280&color=fff&size=150";

export interface ProductInput {
  title: string;
  description: string;
  image: string;
  price: number;
  inStock: number;
  saleMode: SaleMode;
  availableDeliveries: DeliveryMethod[];
  pickupPoints: PickupPoint[];
  dealContacts?: string;
}

export interface PostInput {
  title: string;
  summary: string;
  body: string;
  coverImage?: string | null;
  productIds: string[];
}

export interface SellerProfile {
  id: string;
  username: string;
  displayName: string;
  bio?: string | null;
  avatar?: string | null;
  payoutToken?: string | null;
  payoutCard?: PayoutCard | null;
}

export interface PayoutCard {
  last4: string;
  cardType: string;
  issuerName: string;
}

export interface DeliverySettings {
  pickupEnabled: boolean;
  pickupPoints: PickupPoint[];
  cdekEnabled: boolean;
}

export interface CheckoutGroup {
  sellerId: string;
  delivery: DeliveryMethod;
  items: { productId: string; quantity: number }[];
  pickupPoint?: PickupPoint;
}

export interface CheckoutContact {
  name: string;
  phone: string;
  email: string;
}

export interface CheckoutResult {
  orders: Order[];
  paymentUrl: string | null;
}

function normalizeSeller(seller?: Partial<Seller> | null): Seller {
  const raw = seller ?? {};
  return {
    id: raw.id ?? "",
    username: raw.username ?? "",
    displayName: raw.displayName ?? "",
    avatar: raw.avatar || AVATAR_FALLBACK,
    bio: raw.bio ?? undefined,
    followersCount: raw.followersCount ?? 0,
    isFollowing: raw.isFollowing ?? false,
    rating: typeof raw.rating === "number" ? raw.rating : 0,
    productsCount: raw.productsCount ?? 0,
    postsCount: raw.postsCount ?? 0,
    joinedAt: raw.joinedAt ?? new Date(0).toISOString(),
  };
}

function normalizeProduct(product: Product): Product {
  return {
    ...product,
    seller: normalizeSeller(product?.seller),
    description: product?.description ?? undefined,
    price: Number(product?.price ?? 0),
    inStock: product?.inStock ?? 0,
    availableDeliveries: product?.availableDeliveries ?? [],
    pickupPoints: product?.pickupPoints ?? [],
    currency: product?.currency ?? "RUB",
  };
}

function normalizePost(post: Post): Post {
  const raw = post as Post & {
    likesCount?: number | null;
    commentsCount?: number | null;
    products?: Product[] | null;
  };
  return {
    ...post,
    seller: normalizeSeller(post?.seller),
    products: (raw.products ?? []).map(normalizeProduct),
    likesCount: raw.likesCount ?? 0,
    commentsCount: raw.commentsCount ?? 0,
    summary: post?.summary ?? "",
    isLiked: Boolean(post?.isLiked),
    coverImage: post?.coverImage || undefined,
  };
}

function normalizeOrder(order: Order): Order {
  const seller = normalizeSeller(order?.seller);
  const raw = order as Order & {
    items?: Array<
      OrderItem & {
        title?: string;
        price?: number | string;
        productId?: string;
        image?: string;
      }
    > | null;
  };
  return {
    ...order,
    seller,
    items: (raw.items ?? []).map((item) => ({
      quantity: item.quantity,
      product: item.product?.title
        ? normalizeProduct(item.product)
        : normalizeProduct({
            id: item.productId ?? item.product?.id ?? "",
            title: item.title || "Товар",
            image: item.image || item.product?.image || "",
            price: Number(item.price ?? item.product?.price ?? 0),
            currency: "RUB",
            sellerId: seller.id,
            seller,
            saleMode: item.product?.saleMode ?? "online",
            availableDeliveries: item.product?.availableDeliveries ?? [],
            inStock: item.product?.inStock ?? 0,
            createdAt: item.product?.createdAt ?? new Date(0).toISOString(),
          }),
    })),
    total: Number(order?.total ?? 0),
  };
}

async function readOrNull<T>(call: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T | null> {
  try {
    return await readData(call);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

// ============================================================
// Posts
// ============================================================

export async function getPosts(): Promise<Post[]> {
  const page = await readData(
    b2c.get<ApiResponse<Paginated<Post>>>("/api/posts", {
      params: { page: 1, pageSize: 20 },
    })
  );
  return (page?.items ?? []).map(normalizePost);
}

export async function getPost(id: string): Promise<Post | null> {
  const post = await readOrNull(b2c.get<ApiResponse<Post>>(`/api/posts/${id}`));
  return post ? normalizePost(post) : null;
}

export interface PostComment {
  id: string;
  postId: string;
  author: { id: string; username: string; displayName: string; avatar: string };
  body: string;
  createdAt: string;
  isOwn: boolean;
}

export async function getPostComments(postId: string): Promise<PostComment[]> {
  const page = await readData(
    b2c.get<ApiResponse<{ items: PostComment[] }>>(`/api/posts/${postId}/comments`, {
      params: { limit: 50 },
    })
  );
  return page?.items ?? [];
}

export async function addPostComment(postId: string, body: string): Promise<PostComment> {
  return readData(b2c.post<ApiResponse<PostComment>>(`/api/posts/${postId}/comments`, { body }));
}

export async function togglePostLike(
  postId: string,
  liked: boolean
): Promise<{ isLiked: boolean; likesCount: number }> {
  const call = liked
    ? b2c.delete<ApiResponse<{ isLiked: boolean; likesCount: number }>>(`/api/posts/${postId}/like`)
    : b2c.post<ApiResponse<{ isLiked: boolean; likesCount: number }>>(`/api/posts/${postId}/like`);
  return readData(call);
}

export async function getPostsBySeller(sellerId: string): Promise<Post[]> {
  const page = await readData(
    b2c.get<ApiResponse<Paginated<Post>>>("/api/posts", {
      params: { page: 1, pageSize: 50 },
    })
  );
  return (page?.items ?? []).filter((post) => post.sellerId === sellerId).map(normalizePost);
}

export async function getSellerPosts(): Promise<Post[]> {
  const page = await readData(
    b2b.get<ApiResponse<Paginated<Post>>>("/api/seller/posts", {
      params: { page: 1, pageSize: 50 },
    })
  );
  return (page?.items ?? []).map(normalizePost);
}

export async function getSellerPost(id: string): Promise<Post | null> {
  const post = await readOrNull(b2b.get<ApiResponse<Post>>(`/api/seller/posts/${id}`));
  return post ? normalizePost(post) : null;
}

export async function createPost(input: PostInput): Promise<Post> {
  const post = await readData(
    b2b.post<ApiResponse<Post>>("/api/posts", {
      title: input.title,
      summary: input.summary,
      body: input.body,
      coverImage: input.coverImage || null,
      status: "draft",
      productIds: input.productIds,
    })
  );
  return normalizePost(post);
}

export async function updatePost(id: string, input: PostInput): Promise<Post> {
  const post = await readData(
    b2b.patch<ApiResponse<Post>>(`/api/posts/${id}`, {
      title: input.title,
      summary: input.summary,
      body: input.body,
      coverImage: input.coverImage || null,
      productIds: input.productIds,
    })
  );
  return normalizePost(post);
}

export async function publishPost(id: string): Promise<Post> {
  const post = await readData(b2b.post<ApiResponse<Post>>(`/api/seller/posts/${id}/publish`));
  return normalizePost(post);
}

export async function deletePost(id: string): Promise<void> {
  await readData(b2b.delete<ApiResponse<null>>(`/api/posts/${id}`));
}

// ============================================================
// Products
// ============================================================

export async function getRecommendations(): Promise<Product[]> {
  const data = await readData(
    b2c.get<ApiResponse<{ items: Product[] }>>("/api/recommendations")
  );
  return (data?.items ?? []).map(normalizeProduct);
}

export async function getProducts(): Promise<Product[]> {
  const page = await readData(
    b2c.get<ApiResponse<Paginated<Product>>>("/api/products", {
      params: { page: 1, pageSize: 50 },
    })
  );
  return (page?.items ?? []).map(normalizeProduct);
}

export async function getProduct(id: string): Promise<Product | null> {
  const product = await readOrNull(b2c.get<ApiResponse<Product>>(`/api/products/${id}`));
  return product ? normalizeProduct(product) : null;
}

export async function getProductsBySeller(sellerId: string): Promise<Product[]> {
  const page = await readData(
    b2c.get<ApiResponse<Paginated<Product>>>("/api/products", {
      params: { page: 1, pageSize: 50, sellerId },
    })
  );
  return (page?.items ?? [])
    .filter((product) => product.sellerId === sellerId)
    .map(normalizeProduct);
}

export async function getSellerProducts(): Promise<Product[]> {
  const page = await readData(
    b2b.get<ApiResponse<Paginated<Product>>>("/api/seller/products", {
      params: { page: 1, pageSize: 50 },
    })
  );
  return (page?.items ?? []).map(normalizeProduct);
}

export async function getSellerProduct(id: string): Promise<Product | null> {
  const product = await readOrNull(b2b.get<ApiResponse<Product>>(`/api/seller/products/${id}`));
  return product ? normalizeProduct(product) : null;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const product = await readData(b2b.post<ApiResponse<Product>>("/api/products", input));
  return normalizeProduct(product);
}

export async function updateProduct(id: string, input: ProductInput): Promise<Product> {
  const product = await readData(b2b.patch<ApiResponse<Product>>(`/api/products/${id}`, input));
  return normalizeProduct(product);
}

export async function deleteProduct(id: string): Promise<void> {
  await readData(b2b.delete<ApiResponse<null>>(`/api/products/${id}`));
}

// ============================================================
// Sellers
// ============================================================

export async function getSeller(username: string): Promise<Seller | null> {
  const seller = await readOrNull(b2c.get<ApiResponse<Seller>>(`/api/sellers/${username}`));
  return seller ? normalizeSeller(seller) : null;
}

export async function getSellers(): Promise<Seller[]> {
  const page = await readData(
    b2c.get<ApiResponse<Paginated<Seller>>>("/api/sellers", {
      params: { page: 1, pageSize: 50 },
    })
  );
  return (page?.items ?? []).map((seller) => normalizeSeller(seller));
}

export async function followSeller(
  sellerId: string
): Promise<{ isFollowing: boolean; followersCount: number }> {
  return readData(b2c.post(`/api/sellers/${sellerId}/follow`));
}

export async function unfollowSeller(
  sellerId: string
): Promise<{ isFollowing: boolean; followersCount: number }> {
  return readData(b2c.delete(`/api/sellers/${sellerId}/follow`));
}

export async function getSubscriptionPosts(q = ""): Promise<Post[]> {
  const page = await readData(
    b2c.get<ApiResponse<Paginated<Post>>>("/api/subscriptions/posts", {
      params: { q: q.trim() || undefined, page: 1, pageSize: 20 },
    })
  );
  return (page?.items ?? []).map(normalizePost);
}

export async function getSubscriptionSellers(q = ""): Promise<Seller[]> {
  const page = await readData(
    b2c.get<ApiResponse<{ items: Seller[]; total: number }>>("/api/subscriptions/sellers", {
      params: { q: q.trim() || undefined },
    })
  );
  return (page?.items ?? []).map((seller) => normalizeSeller(seller));
}

export async function becomeSeller(input: {
  username: string;
  displayName: string;
  bio?: string;
}): Promise<void> {
  await readData(
    b2b.post<ApiResponse<unknown>>("/api/users/me/become-seller", {
      username: input.username,
      displayName: input.displayName,
      bio: input.bio ?? "",
    })
  );
}

export async function getSellerProfile(): Promise<SellerProfile> {
  return readData(b2b.get<ApiResponse<SellerProfile>>("/api/seller/profile"));
}

export async function getSellerSubscription(): Promise<{ tier: string; onlinePayments: boolean }> {
  return readData(
    b2b.get<ApiResponse<{ tier: string; onlinePayments: boolean }>>("/api/seller/subscription")
  );
}

export async function subscribePremium(): Promise<{ paymentUrl: string; status: string }> {
  return readData(
    b2b.post<ApiResponse<{ paymentUrl: string; status: string }>>(
      "/api/plans/subscribe",
      { tier: "premium" },
      { headers: { "Idempotency-Key": crypto.randomUUID() } }
    )
  );
}

export async function syncSubscription(): Promise<{ status: string; tier: string }> {
  return readData(
    b2b.post<ApiResponse<{ status: string; tier: string }>>("/api/seller/subscription/sync")
  );
}

export async function getTestPayment(orderId: string): Promise<{
  amount: number;
  status: string;
  paid: boolean;
}> {
  return readData(
    b2c.get<ApiResponse<{ amount: number; status: string; paid: boolean }>>(
      `/api/payments/test/${orderId}`
    )
  );
}

export async function confirmTestPayment(orderId: string): Promise<{
  amount: number;
  status: string;
  paid: boolean;
}> {
  return readData(
    b2c.post<ApiResponse<{ amount: number; status: string; paid: boolean }>>(
      `/api/payments/test/${orderId}`
    )
  );
}

export async function getPayoutWidget(): Promise<{ shopId: string }> {
  return readData(b2c.get<ApiResponse<{ shopId: string }>>("/api/payments/widget"));
}

export async function savePayoutToken(payoutToken: string, card?: PayoutCard | null): Promise<void> {
  await readData(
    b2b.put<ApiResponse<{ saved: boolean }>>("/api/seller/payout-token", {
      payoutToken,
      ...(card ? { card } : {}),
    })
  );
}

export async function updateSellerProfile(input: {
  displayName: string;
  bio: string;
  avatar: string;
}): Promise<SellerProfile> {
  return readData(b2b.patch<ApiResponse<SellerProfile>>("/api/seller/profile", input));
}

export async function getDeliverySettings(): Promise<DeliverySettings> {
  return readData(b2b.get<ApiResponse<DeliverySettings>>("/api/seller/delivery"));
}

export async function updateDeliverySettings(input: DeliverySettings): Promise<DeliverySettings> {
  return readData(b2b.patch<ApiResponse<DeliverySettings>>("/api/seller/delivery", input));
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const data = await readData(b2b.post<ApiResponse<{ url: string }>>("/api/uploads", form));
  if (!data?.url) {
    throw new Error("Не удалось загрузить изображение");
  }
  return data.url;
}

// ============================================================
// Orders
// ============================================================

export async function getOrders(): Promise<Order[]> {
  const page = await readData(
    b2c.get<ApiResponse<Paginated<Order>>>("/api/orders", {
      params: { role: "buyer", page: 1, pageSize: 50 },
    })
  );
  return (page?.items ?? []).map(normalizeOrder);
}

export async function getOrder(id: string): Promise<Order | null> {
  const order = await readOrNull(b2c.get<ApiResponse<Order>>(`/api/orders/${id}`));
  return order ? normalizeOrder(order) : null;
}

export async function createOrder(body: {
  groups: CheckoutGroup[];
  contact: CheckoutContact;
}): Promise<CheckoutResult> {
  return readData(b2c.post<ApiResponse<CheckoutResult>>("/api/orders", body));
}

export async function completePickup(orderId: string, receivalCode: string): Promise<Order> {
  const order = await readData(
    b2c.post<ApiResponse<Order>>(`/api/orders/${orderId}/receive`, { receivalCode })
  );
  return normalizeOrder(order);
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  options?: { trackingNumber?: string }
): Promise<Order> {
  const body: { status: OrderStatus; trackingNumber?: string } = { status };
  if (options?.trackingNumber) {
    body.trackingNumber = options.trackingNumber;
  }
  const order = await readData(
    b2b.patch<ApiResponse<Order>>(`/api/seller/orders/${id}/status`, body, {
      headers: { "Idempotency-Key": idempotencyKey() },
    })
  );
  return normalizeOrder(order);
}

export async function getOrdersBySeller(_sellerId: string): Promise<Order[]> {
  const page = await readData(
    b2b.get<ApiResponse<Paginated<Order>>>("/api/seller/orders", {
      params: { page: 1, pageSize: 50 },
    })
  );
  return (page?.items ?? []).map(normalizeOrder);
}

export async function getSellerOrder(id: string): Promise<Order | null> {
  const order = await readOrNull(b2b.get<ApiResponse<Order>>(`/api/seller/orders/${id}`));
  return order ? normalizeOrder(order) : null;
}

// ============================================================
// Search
// ============================================================

export async function searchPosts(query: string): Promise<Post[]> {
  const q = query.trim();
  if (!q) return [];
  const page = await readData(
    b2c.get<ApiResponse<Paginated<Post>>>("/api/posts", {
      params: { q, page: 1, pageSize: 20 },
    })
  );
  return (page?.items ?? []).map(normalizePost);
}

export async function searchProducts(query: string): Promise<Product[]> {
  const q = query.trim();
  if (!q) return [];
  const page = await readData(
    b2c.get<ApiResponse<Paginated<Product>>>("/api/products", {
      params: { q, page: 1, pageSize: 20 },
    })
  );
  return (page?.items ?? []).map(normalizeProduct);
}

export async function searchSellers(query: string): Promise<Seller[]> {
  const q = query.trim();
  if (!q) return [];
  const page = await readData(
    b2c.get<ApiResponse<Paginated<Seller>>>("/api/sellers", {
      params: { q, page: 1, pageSize: 20 },
    })
  );
  return (page?.items ?? []).map((seller) => normalizeSeller(seller));
}
