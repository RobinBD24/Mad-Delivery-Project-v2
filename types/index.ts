// ── Shared API types (mirror the DRF serializers) ─────────────────────

export type Role =
  | "super_admin"
  | "management"
  | "marketing"
  | "branch_manager"
  | "accounts"
  | "rider"
  | "customer";

export type UserStatus = "pending" | "approved" | "rejected";

export type OrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export type PaymentMethod = "cash" | "bkash";

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
  role_display: string;
  status: UserStatus;
  status_display: string;
  is_active: boolean;
  is_blocked: boolean;
  blocked_reason: string;
  phone: string;
  address: string;
  date_of_birth: string | null;
  gender: string;
  profile_photo: string | null;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejection_reason: string;
  date_joined: string;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: number;
  name: string;
  address: string;
  phone: string;
  email?: string;
  latitude?: string | null;
  longitude?: string | null;
  delivery_radius_km: string;
  brand_type?: string; // cheez | madchef | combined
  bkash_number?: string;
  manager?: number | null;
  manager_name?: string | null;
  is_active?: boolean;
  // req #5 — serialized by `serializeBranch`; lets the list show "Archived"
  // (history preserved, no new orders) rather than merely "Inactive".
  is_archived?: boolean;
  opening_time: string | null;
  closing_time: string | null;
  logo: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Category {
  id: number;
  branch: number | null; // null = global ("Main Branch")
  branch_name: string | null;
  is_global: boolean;
  name: string;
  description: string;
  is_active: boolean;
  product_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProductVariation {
  id: number;
  product: number;
  name: string;
  size_label: string;
  price: string;
  compare_at_price: string | null;
  serving_info: string;
  variant_type: string;
  sort_order: number;
  is_default: boolean;
  is_enabled: boolean;
}

export interface Product {
  id: number;
  branch: number;
  branch_name: string;
  brand: string | null;
  category: number | null;
  category_name: string | null;
  name: string;
  description: string;
  price: string;
  discount: string;
  discounted_price: string;
  image: string | null;
  is_available: boolean;
  /** Why the branch manager deactivated it (serializer already returns this). */
  deactivation_reason: string;
  /** Super-admin cross-branch hold — blocks new orders everywhere. */
  held_by_admin: boolean;
  preparation_time: number;
  is_popular: boolean;
  is_recommended: boolean;
  /** req #4 — crust policy: "THICK" | "THIN" | "BOTH". */
  variation_type: string;
  default_variation_id: number | null;
  has_variations: boolean;
  variations: ProductVariation[];
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: number;
  product: number;
  product_name: string;
  product_image: string | null;
  variation: number | null;
  variation_name: string;
  quantity: number;
  unit_price: string;
  food_note: string;
  subtotal: string;
}

export interface Order {
  id: number;
  order_number: string | null;
  customer: number;
  customer_name: string;
  customer_phone: string;
  branch: number;
  branch_name: string;
  rider: number | null;
  rider_name: string | null;
  rider_phone: string | null;
  status: OrderStatus;
  status_display: string;
  payment_method: PaymentMethod;
  payment_method_display: string;
  total_amount: string;
  food_notes: string;
  delivery_address: string;
  fulfillment_type?: string;
  prep_time_snapshot?: number | null;
  delivery_area?: number | null;
  delivery_area_name?: string;
  delivery_charge?: string;
  delivery_estimate_minutes?: number | null;
  assignment?: {
    status: string;
    distance_km: number | null;
    rejection_reason: string;
    responded_at: string | null;
    rider_name: string | null;
    rider_phone: string | null;
  } | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface RiderProfile {
  id: number;
  user: number;
  rider_name: string;
  rider_username: string;
  rider_phone: string;
  assigned_branch: number | null;
  assigned_branch_name: string | null;
  blood_group: string;
  education: string;
  present_address: string;
  permanent_address: string;
  nid_number: string;
  driving_license_number: string;
  bike_registration_number: string;
  vehicle_type: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  nid_front_image: string | null;
  nid_back_image: string | null;
  license_image: string | null;
}

export interface DutyLog {
  id: number;
  rider: number;
  rider_name: string;
  branch: number;
  branch_name: string;
  date: string;
  clock_in: string;
  clock_out: string | null;
  is_on_duty: boolean;
  duration_minutes: number | null;
  duration_str: string;
}

export interface ManagerAssignment {
  id: number;
  manager: number;
  manager_name: string;
  manager_username: string;
  branch: number;
  branch_name: string;
  assigned_at: string;
  relieved_at: string | null;
  is_active: boolean;
  duration_days: number;
  assigned_by: number | null;
  assigned_by_name: string | null;
  notes: string;
}

export interface ActivityLog {
  id: number;
  manager: number;
  manager_name: string;
  manager_username: string;
  branch: number | null;
  branch_name: string | null;
  activity_type: "login" | "logout" | "action";
  activity_type_display: string;
  description: string;
  ip_address: string | null;
  timestamp: string;
}

// ── Notifications, notices, complaints ────────────────────────────────

export type ComplaintStatus = "pending" | "in_progress" | "resolved" | "closed";
export type ComplaintCategory =
  | "food_quality"
  | "delivery"
  | "service"
  | "payment"
  | "app"
  | "other";
export type NotificationType =
  | "system"
  | "order"
  | "delivery"
  | "payment"
  | "withdrawal"
  | "commission"
  | "complaint"
  | "reward"
  | "review"
  | "marketing"
  | "reservation"
  | "ramadan"
  | "notice"
  | "security"
  | "account"
  | "branch"
  | "catalog";

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  /** i18n key for system-generated titles/bodies (translated client-side). */
  title_key: string | null;
  body_key: string | null;
  /** Interpolation vars; string values prefixed "@:" are themselves i18n keys. */
  params: Record<string, string | number> | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Notice {
  id: number;
  author: number;
  author_name: string;
  title: string;
  body: string;
  audience: string;
  audience_display: string;
  type: string;
  recipients: number;
  created_at: string;
}

export interface ComplaintMessageT {
  id: number;
  sender: number;
  sender_name: string;
  sender_role: Role;
  body: string;
  created_at: string;
}

export interface Complaint {
  id: number;
  complainant: number;
  complainant_name: string;
  complainant_role: Role;
  recipient_role: Role;
  recipient_role_display: string;
  branch: number | null;
  branch_name: string | null;
  order: number | null;
  category: ComplaintCategory;
  category_display: string;
  subject: string;
  message: string;
  status: ComplaintStatus;
  status_display: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  message_count: number;
  messages?: ComplaintMessageT[];
  created_at: string;
  updated_at: string;
}

// ── Money flow (commission / wallet / withdrawals) ────────────────────

export type WithdrawalStatus = "pending" | "approved" | "rejected" | "paid";

export interface RiderCommissionT {
  id: number;
  rider: number;
  rider_name: string;
  order: number;
  branch: number | null;
  branch_name: string | null;
  amount: string;
  created_at: string;
}

export interface RiderWithdrawalT {
  id: number;
  rider: number;
  rider_name: string;
  rider_username: string;
  amount: string;
  status: WithdrawalStatus;
  status_display: string;
  note: string;
  rejection_reason: string;
  decided_by: number | null;
  decided_by_name: string | null;
  decided_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface WalletSummaryT {
  total_deliveries: number;
  total_earnings: string;
  pending_amount: string;
  paid_amount: string;
  available_balance: string;
  commission_rate: string;
}

export interface RiderEarningRowT {
  rider: number;
  rider_name: string;
  rider_username: string;
  branch_name: string | null;
  deliveries: number;
  total_earnings: string;
  pending_amount: string;
  paid_amount: string;
  available_balance: string;
}

export interface AccountsReportPeriod {
  label: string; // e.g. "2026-07-11" or "2026-W28" or "2026-07"
  orders: number;
  sales: string;
  commission: string;
  withdrawals_paid: string;
}

// ── Dashboard payloads ────────────────────────────────────────────────

export interface SuperAdminDashboard {
  users: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    customers: number;
    riders: number;
    branch_managers: number;
    by_role: Record<Role, number>;
  };
  branches: { total: number; active: number };
  orders: {
    total: number;
    today: number;
    today_sales: number | string;
    total_sales: number | string;
    status_breakdown: Record<OrderStatus, number>;
  };
  weekly_sales: { date: string; total: number }[];
  weekly_orders: { date: string; total: number }[];
  branch_performance: {
    branch__id: number;
    branch__name: string;
    orders: number;
    sales: string | number;
  }[];
  branch_overview: {
    id: number;
    name: string;
    manager_name: string | null;
    is_active: boolean;
    today_orders: number;
    today_sales: number | string;
    riders: number;
  }[];
  pending_queue: {
    id: number;
    username: string;
    full_name: string;
    email: string;
    role: Role;
    role_display: string;
    phone: string;
    date_joined: string;
  }[];
  recent_orders: Order[];
  recent_activity: ActivityLog[];
}

export interface BranchManagerDashboard {
  branch: {
    id: number;
    name: string;
    address: string;
    is_active: boolean;
    // req #5 — branch identity shown on the Branch Manager dashboard.
    is_archived?: boolean;
    brand_type?: string;
    delivery_area_count?: number;
    delivery_radius_km?: number;
    delivery_fee?: number;
  } | null;
  today?: {
    total_orders: number;
    sales: number | string;
    status_breakdown: Record<OrderStatus, number>;
  };
  weekly_sales?: { date: string; total: number }[];
  popular_items?: {
    product__id: number;
    product__name: string;
    order_count: number;
    revenue: string | number;
  }[];
  recent_orders?: Order[];
  riders?: { total: number; on_duty: number; off_duty: number };
  total_products?: number;
}

export interface RiderDashboard {
  assigned_branch: { id: number; name: string } | null;
  profile: {
    vehicle_type: string;
    bike_registration_number: string;
    blood_group: string;
    phone: string;
  };
  /** Live availability toggle (RiderProfile.isOnline) — not the duty clock. */
  is_online: boolean;
  today_duty: DutyLog | null;
  duty_history: DutyLog[];
  active_orders: Order[];
  delivered_today: number;
  online_minutes: number;
  total_delivered: number;
  cancelled_total: number;
  weekly_deliveries: { date: string; total: number }[];
  /** Real commission ৳ per day (same week window as weekly_deliveries). */
  weekly_earnings: { date: string; total: number }[];
  earnings_today: number;
  earnings_week: number;
  distance_today_km: number;
  avg_rating: number | null;
  rating_count: number;
  wallet: {
    available_balance: number;
    pending_withdrawals: number;
    total_earnings: number;
    paid_out: number;
  };
}

export interface CustomerDashboard {
  branches: Branch[];
  recent_orders: Order[];
  active_order_count: number;
  total_orders: number;
}

export interface ManagementDashboard {
  total_users: number;
  total_customers: number;
  total_riders: number;
  pending_users: number;
  active_branches: number;
  total_orders: number;
  delivered_orders: number;
  total_sales: number | string;
  today_orders: number;
  today_sales: number | string;
  status_breakdown: Record<OrderStatus, number>;
  weekly_sales: { date: string; total: number }[];
  branch_performance: {
    branch__id: number;
    branch__name: string;
    orders: number;
    sales: string | number;
  }[];
  top_riders: {
    rider__id: number;
    rider__first_name: string;
    rider__last_name: string;
    rider__username: string;
    deliveries: number;
    sales: string | number;
  }[];
}

export interface MarketingDashboard {
  total_customers: number;
  new_customers_today: number;
  new_customers_7d: number;
  new_customers_30d: number;
  total_orders: number;
  active_branches: number;
  popular_products: {
    product__id: number;
    product__name: string;
    order_count: number;
    revenue: string | number;
  }[];
  top_categories: {
    product__category__id: number;
    product__category__name: string;
    order_count: number;
    quantity: number;
  }[];
  recent_orders: Order[];
}

export interface AccountsDashboard {
  total_sales: number | string;
  delivered_orders: number;
  cancelled_orders: number;
  sales_by_branch: {
    branch__id: number;
    branch__name: string;
    orders: number;
    sales: string | number;
  }[];
  sales_by_payment: { payment_method: PaymentMethod; orders: number; sales: string | number }[];
}

// ── Cart (client-side only) ──────────────────────────────────────────

export interface CartItem {
  productId: number;
  variationId: number | null;
  variationName: string;
  /** req #4 — chosen crust ("THICK" | "THIN" | ""); part of the cart line identity. */
  variationType?: string;
  name: string;
  unitPrice: number;
  quantity: number;
  foodNote: string;
  image: string | null;
}

export interface Cart {
  branchId: number | null;
  branchName: string;
  items: CartItem[];
}
