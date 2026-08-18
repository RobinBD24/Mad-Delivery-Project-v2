"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type {
  ActionState,
  BranchDeleteResult,
  BranchDeleteState,
  EarningRuleFormValues,
} from "@/lib/api/action-state";
import { ApiError, sendForm, sendJSON } from "@/lib/api/client";
import { getT } from "@/lib/i18n/server";
import { parseFieldErrors } from "@/lib/validation/contract";
import type { Complaint, Order, OrderStatus, User } from "@/types";

/** Translate a message key using the request's active locale (bn/en). */
async function tr(key: string): Promise<string> {
  const { t } = await getT();
  return t(key);
}

/**
 * Turn a failed API call into form state.
 *
 * The backend already answers with a field→message map (`validationError({ … })`
 * in the service layer). This used to flatten that map into ONE sentence, which
 * is why backend errors could only ever be shown as a banner. It now keeps the
 * per-field messages so `useFormValidation({ serverErrors })` can place each one
 * directly under its own field, and reserves `error` for the form-level message
 * (`detail` / `non_field_errors`) that belongs to no single field.
 *
 * Authorization failures keep their own status on the wire (401/403) and simply
 * surface here as a form-level message — they are never disguised as a field
 * validation error.
 */
async function errorState(err: unknown): Promise<ActionState> {
  if (err instanceof ApiError) {
    const { fieldErrors, formError } = parseFieldErrors(err.data);
    const hasFields = Object.keys(fieldErrors).length > 0;
    return {
      error: formError ?? (hasFields ? null : await tr("errors.generic")),
      fieldErrors,
      submissionId: Date.now(),
    };
  }
  throw err; // redirects and unexpected errors propagate
}

/** Strip React-internal keys and empty file inputs from a form payload. */
function cleanForm(formData: FormData): FormData {
  const body = new FormData();
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$")) continue;
    if (value instanceof File && value.size === 0) continue;
    body.append(key, value);
  }
  return body;
}

/**
 * User form cleanup. Create omits empty optional values. Edit preserves empty
 * profile fields so an admin can intentionally clear them, while an empty
 * password still means "leave the current password unchanged."
 */
function cleanUserForm(formData: FormData, isEdit: boolean): FormData {
  const body = new FormData();
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$")) continue;
    if (value instanceof File) {
      if (value.size > 0) body.append(key, value);
      continue;
    }
    if (value === "" && (!isEdit || key === "password")) continue;
    body.append(key, value);
  }
  return body;
}

// ── User administration (super admin) ───────────────────────────────────

export async function saveUserAction(
  userId: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let user: User;
  try {
    const body = cleanUserForm(formData, userId !== null);
    if (userId === null) {
      user = await sendForm<User>("/auth/users/", "POST", body);
    } else {
      user = await sendForm<User>(`/auth/users/${userId}/`, "PATCH", body);
    }
  } catch (err) {
    return await errorState(err);
  }
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${user.id}`);
  redirect(`/admin/users/${user.id}`);
}

export async function deleteUserAction(userId: number): Promise<ActionState> {
  try {
    await sendJSON(`/auth/users/${userId}/`, "DELETE");
  } catch (err) {
    return await errorState(err);
  }
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function setUserActiveAction(userId: number, active: boolean): Promise<ActionState> {
  try {
    await sendJSON(`/auth/users/${userId}/${active ? "activate" : "deactivate"}/`, "POST");
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return { error: null, success: active ? await tr("toast.accountActivated") : await tr("toast.accountDeactivated") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function approveUserAction(userId: number): Promise<ActionState> {
  try {
    await sendJSON(`/auth/users/${userId}/approve/`, "POST");
    revalidatePath("/admin/dashboard");
    return { error: null, success: await tr("toast.accountApproved") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function rejectUserAction(userId: number, reason: string): Promise<ActionState> {
  try {
    await sendJSON(`/auth/users/${userId}/reject/`, "POST", { reason });
    revalidatePath("/admin/dashboard");
    return { error: null, success: await tr("toast.accountRejected") };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Branches (super admin) ──────────────────────────────────────────────

export async function saveBranchAction(
  branchId: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const body = cleanForm(formData);
    if (branchId === null) {
      await sendForm("/branches/", "POST", body);
    } else {
      await sendForm(`/branches/${branchId}/`, "PATCH", body);
    }
  } catch (err) {
    return await errorState(err);
  }
  revalidatePath("/admin/branches");
  redirect("/admin/branches");
}

/**
 * Archive-or-delete a branch. The SERVER decides which one happened (req #5) and
 * this returns that verdict verbatim — it is never assumed client-side.
 *
 * This deliberately does NOT `redirect()`. A redirecting Server Action settles
 * its client promise by REJECTING it with a NEXT_REDIRECT error (Next has no
 * action result to resolve with), so every statement after `await action()` in
 * the caller is skipped. That is what left `ConfirmModal` stuck open — its
 * full-screen overlay stayed mounted over the branch list and swallowed every
 * later Delete click. Returning the outcome lets the dialog close, reset its
 * pending state, and refresh the list normally.
 */
export async function deleteBranchAction(branchId: number): Promise<BranchDeleteState> {
  let result: BranchDeleteResult = "deleted";
  try {
    const res = await sendJSON<{ action?: string }>(`/branches/${branchId}/`, "DELETE");
    if (res?.action === "archived" || res?.action === "deleted") result = res.action;
  } catch (err) {
    return await errorState(err);
  }
  revalidatePath("/admin/branches");
  revalidatePath(`/admin/branches/${branchId}`);
  return {
    error: null,
    result,
    success: await tr(result === "archived" ? "branches.archivedResult" : "branches.deletedResult"),
  };
}

export async function setBranchActiveAction(branchId: number, active: boolean): Promise<ActionState> {
  try {
    await sendJSON(`/branches/${branchId}/${active ? "activate" : "deactivate"}/`, "POST");
    revalidatePath("/admin/branches");
    revalidatePath(`/admin/branches/${branchId}`);
    return { error: null, success: active ? await tr("toast.branchActivated") : await tr("toast.branchDeactivated") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function assignManagerAction(
  branchId: number,
  managerId: number | null,
  notes: string,
): Promise<ActionState> {
  try {
    await sendJSON(`/branches/${branchId}/assign-manager/`, "POST", {
      manager_id: managerId,
      notes,
    });
    revalidatePath("/admin/branches");
    revalidatePath(`/admin/branches/${branchId}`);
    revalidatePath("/admin/dashboard");
    return { error: null, success: await tr("toast.managerAssigned") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function assignRiderBranchAction(
  riderUserId: number,
  branchId: number | null,
): Promise<ActionState> {
  try {
    await sendJSON(`/riders/${riderUserId}/assign-branch/`, "POST", { branch_id: branchId });
    revalidatePath("/admin/dashboard");
    return { error: null, success: await tr("toast.riderBranchUpdated") };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Catalog (branch manager) ──────────────────────────────────────────

export async function saveCategoryAction(
  categoryId: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const payload = {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      is_active: formData.get("is_active") === "on",
    };
    if (categoryId === null) {
      await sendJSON("/categories/", "POST", payload);
    } else {
      await sendJSON(`/categories/${categoryId}/`, "PATCH", payload);
    }
  } catch (err) {
    return await errorState(err);
  }
  revalidatePath("/branch-manager/catalog");
  redirect("/branch-manager/catalog");
}

/**
 * req #2 — delete a category. The server DEACTIVATES instead of deleting when
 * the category still has products (existing products + order history stay
 * intact) and reports which happened, so the UI states the real outcome.
 * Super-admin-only — enforced server-side in the catalog service.
 */
/** PHASE G — activate / pause the reward programme (super-admin-only). */
export async function setRewardProgramActiveAction(isActive: boolean): Promise<ActionState> {
  try {
    await sendJSON("/admin/rewards/status/", "POST", { is_active: isActive });
    revalidatePath("/admin/rewards");
    return {
      error: null,
      success: await tr(isActive ? "rewards.activatedResult" : "rewards.deactivatedResult"),
    };
  } catch (err) {
    return await errorState(err);
  }
}

export async function deleteCategoryAction(categoryId: number): Promise<ActionState> {
  try {
    const res = await sendJSON<{ deactivated?: boolean }>(`/categories/${categoryId}/`, "DELETE");
    revalidatePath("/branch-manager/catalog");
    revalidatePath("/admin/categories");
    return {
      error: null,
      success: await tr(res?.deactivated ? "categories.deactivatedResult" : "categories.deletedResult"),
    };
  } catch (err) {
    return await errorState(err);
  }
}

export async function saveProductAction(
  productId: number | null,
  basePath: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const body = cleanForm(formData);
    // checkboxes: send explicit true/false
    for (const flag of ["is_available", "is_popular", "is_recommended"]) {
      body.set(flag, formData.get(flag) === "on" ? "true" : "false");
    }
    if (!body.get("category")) body.delete("category");
    if (productId === null) {
      await sendForm("/products/", "POST", body);
    } else {
      await sendForm(`/products/${productId}/`, "PATCH", body);
    }
  } catch (err) {
    return await errorState(err);
  }
  revalidatePath(basePath);
  redirect(basePath);
}

export async function deleteProductAction(productId: number): Promise<ActionState> {
  try {
    // Soft delete — see softDeleteProduct. Invalidation is handled server-side
    // by revalidateCatalog() so the storefront, menu and search all follow.
    await sendJSON(`/products/${productId}/`, "DELETE");
    return { error: null, success: await tr("toast.productDeleted") };
  } catch (err) {
    return await errorState(err);
  }
}

/**
 * Activate / deactivate a product. Used by both the Branch Manager catalogue and
 * the Super Admin product list; the endpoint decides what each role may touch.
 * Cache invalidation is done by the route handler through revalidateCatalog(),
 * so every customer surface follows — not just the catalogue page.
 */
export async function toggleProductAction(productId: number, reason = ""): Promise<ActionState> {
  try {
    await sendJSON(`/products/${productId}/toggle-availability/`, "POST", { reason });
    return { error: null, success: await tr("toast.productToggled") };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Super admin controls: block customers, hold products, categories ──

export async function blockCustomerAction(userId: number, reason: string): Promise<ActionState> {
  try {
    await sendJSON(`/auth/users/${userId}/block/`, "POST", { reason });
    revalidatePath("/admin/customers");
    revalidatePath("/admin/customers/blocked");
    return { error: null, success: await tr("adminExtras.customerBlocked") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function unblockCustomerAction(userId: number): Promise<ActionState> {
  try {
    await sendJSON(`/auth/users/${userId}/unblock/`, "POST");
    revalidatePath("/admin/customers");
    revalidatePath("/admin/customers/blocked");
    return { error: null, success: await tr("adminExtras.customerUnblocked") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function setProductHoldAction(productId: number, hold: boolean): Promise<ActionState> {
  try {
    await sendJSON(`/products/${productId}/${hold ? "hold" : "unhold"}/`, "POST");
    return {
      error: null,
      success: hold ? await tr("adminExtras.productHeld") : await tr("adminExtras.productReleased"),
    };
  } catch (err) {
    return await errorState(err);
  }
}

/** req #3 — explicit activate/deactivate for a category (super-admin-only). */
export async function setCategoryActiveAction(
  categoryId: number,
  isActive: boolean,
): Promise<ActionState> {
  try {
    await sendJSON(`/categories/${categoryId}/status/`, "POST", { is_active: isActive });
    revalidatePath("/admin/categories");
    return {
      error: null,
      success: await tr(isActive ? "categories.activatedResult" : "categories.deactivatedResult"),
    };
  } catch (err) {
    return await errorState(err);
  }
}

export async function adminCreateCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    // branch_id may be a branch id or "global"/"" for Main Branch (Global) — the
    // catalog service resolves the scope (req #8). Pass it through raw.
    const branchValue = String(formData.get("branch_id") ?? "");
    await sendJSON("/categories/", "POST", {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      branch_id: branchValue === "" ? "global" : branchValue,
      is_active: true,
    });
    revalidatePath("/admin/categories");
    return { error: null, success: await tr("adminExtras.categoryCreated") };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Orders ────────────────────────────────────────────────────────────

export interface CheckoutPayload {
  branch_id: number;
  payment_method: string;
  delivery_address: string;
  food_notes: string;
  coupon_code?: string;
  items: { product_id: number; variation_id?: number; variation_type?: string; quantity: number; food_note: string }[];
  fulfillment_type?: string;
  lat?: number;
  lng?: number;
  delivery_area_id?: number;
  /** PHASE R — per-attempt key so a retry cannot duplicate the order. */
  idempotency_key?: string;
}

export async function placeOrderAction(
  payload: CheckoutPayload,
): Promise<ActionState & { orderId?: number }> {
  try {
    const order = await sendJSON<Order>("/orders/", "POST", payload);
    revalidatePath("/customer/orders");
    return { error: null, orderId: order.id };
  } catch (err) {
    return await errorState(err);
  }
}

export async function updateOrderStatusAction(
  orderId: number,
  status: OrderStatus,
): Promise<ActionState> {
  try {
    await sendJSON(`/orders/${orderId}/update-status/`, "POST", { status });
    revalidatePath("/branch-manager/orders");
    revalidatePath(`/branch-manager/orders/${orderId}`);
    revalidatePath("/rider/orders");
    revalidatePath(`/rider/orders/${orderId}`);
    revalidatePath("/customer/orders");
    revalidatePath(`/customer/orders/${orderId}`);
    revalidatePath("/rider/dashboard");
    return { error: null, success: await tr("toast.orderStatusUpdated") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function assignOrderRiderAction(
  orderId: number,
  riderId: number | null,
): Promise<ActionState> {
  try {
    await sendJSON(`/orders/${orderId}/assign-rider/`, "POST", { rider_id: riderId });
    revalidatePath("/branch-manager/orders");
    revalidatePath(`/branch-manager/orders/${orderId}`);
    return { error: null, success: await tr("toast.riderAssigned") };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Rider duty ────────────────────────────────────────────────────────

export async function clockInAction(branchId: number | null): Promise<ActionState> {
  try {
    await sendJSON("/riders/duty/clock-in/", "POST", { branch_id: branchId });
    revalidatePath("/rider/dashboard");
    revalidatePath("/rider/duty-history");
    return { error: null, success: await tr("toast.dutyStarted") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function clockOutAction(): Promise<ActionState> {
  try {
    await sendJSON("/riders/duty/clock-out/", "POST");
    revalidatePath("/rider/dashboard");
    revalidatePath("/rider/duty-history");
    return { error: null, success: await tr("toast.dutyEnded") };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Profile ───────────────────────────────────────────────────────────

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await sendForm("/auth/profile/", "PATCH", cleanForm(formData));
    // Revalidate the whole authenticated layout so the refreshed avatar/name
    // propagate to the topbar, sidebar and every dashboard page at once.
    revalidatePath("/", "layout");
    return { error: null, success: await tr("toast.profileUpdated") };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Money flow (commission / withdrawals) ────────────────────────────

export async function saveDeliveryFeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await sendJSON("/admin/settings/delivery-fees/", "PUT", {
      commission_per_delivery: String(formData.get("commission_per_delivery") ?? ""),
    });
    revalidatePath("/admin/settings/delivery-fees");
    return { error: null, success: await tr("wallet.feeSaved") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function requestWithdrawalAction(
  amount: string,
  note: string,
): Promise<ActionState> {
  try {
    await sendJSON("/rider/withdrawals/", "POST", { amount, note });
    revalidatePath("/rider/withdrawals");
    revalidatePath("/rider/wallet");
    return { error: null, success: await tr("wallet.withdrawalRequested") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function decideWithdrawalAction(
  withdrawalId: number,
  decision: "approve" | "reject" | "pay",
  reason = "",
): Promise<ActionState> {
  try {
    await sendJSON(`/accounts/withdrawals/${withdrawalId}/decide/`, "POST", { decision, reason });
    revalidatePath("/accounts/withdrawals");
    revalidatePath("/accounts/rider-earnings");
    return { error: null, success: await tr(`wallet.decision_${decision}`) };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Customer: addresses / rewards / reviews / reorder / settings ─────

export async function saveAddressAction(
  addressId: number | null,
  payload: {
    label: string;
    custom_label?: string;
    address: string;
    area?: string;
    instructions?: string;
    latitude?: number | null;
    longitude?: number | null;
    is_default: boolean;
  },
): Promise<ActionState> {
  try {
    if (addressId === null) await sendJSON("/customer/addresses/", "POST", payload);
    else await sendJSON(`/customer/addresses/${addressId}/`, "PATCH", payload);
    revalidatePath("/customer/addresses");
    return { error: null, success: await tr("addresses.saved") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function deleteAddressAction(addressId: number): Promise<ActionState> {
  try {
    await sendJSON(`/customer/addresses/${addressId}/`, "DELETE");
    revalidatePath("/customer/addresses");
    return { error: null, success: await tr("addresses.deleted") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function setDefaultAddressAction(addressId: number): Promise<ActionState> {
  try {
    await sendJSON(`/customer/addresses/${addressId}/`, "PATCH", { is_default: true });
    revalidatePath("/customer/addresses");
    return { error: null, success: await tr("addresses.defaultSet") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function redeemCoinsAction(coins: number): Promise<ActionState> {
  try {
    await sendJSON("/customer/rewards/", "POST", { coins });
    revalidatePath("/customer/rewards");
    return { error: null, success: await tr("rewards.redeemed") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function submitReviewAction(payload: {
  order_id: number;
  type: "rider" | "food";
  rating: number;
  comment: string;
  product_id?: number;
}): Promise<ActionState> {
  try {
    await sendJSON("/reviews/", "POST", payload);
    revalidatePath("/customer/reviews");
    revalidatePath(`/customer/orders/${payload.order_id}`);
    return { error: null, success: await tr("reviews.submitted") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function reorderAction(orderId: number): Promise<ActionState & { orderId?: number }> {
  try {
    const order = await sendJSON<Order>(`/orders/${orderId}/reorder/`, "POST");
    revalidatePath("/customer/orders");
    return { error: null, success: await tr("orders.reordered"), orderId: order.id };
  } catch (err) {
    return await errorState(err);
  }
}

export async function toggleNotificationsAction(enabled: boolean): Promise<ActionState> {
  try {
    await sendJSON("/customer/settings/", "PATCH", { notifications_enabled: enabled });
    revalidatePath("/customer/settings");
    return {
      error: null,
      success: enabled ? await tr("settings.notifsOn") : await tr("settings.notifsOff"),
    };
  } catch (err) {
    return await errorState(err);
  }
}

export async function saveRewardConfigAction(payload: {
  coin_value_tk: string;
  min_redeem_coins: number;
  rules: { key: string; coins: number; is_active: boolean }[];
}): Promise<ActionState> {
  try {
    await sendJSON("/admin/rewards/", "PUT", payload);
    revalidatePath("/admin/rewards");
    return { error: null, success: await tr("rewards.configSaved") };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Accounts financials: refunds / expenses / settlements / adjustments ─

export async function processRefundAction(payload: {
  order_id: number;
  amount: string;
  reason: string;
}): Promise<ActionState> {
  try {
    await sendJSON("/accounts/refunds/", "POST", payload);
    revalidatePath("/accounts/refunds");
    return { error: null, success: await tr("financials.refundProcessed") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function recordExpenseAction(payload: {
  branch_id: number;
  category: string;
  amount: string;
  note: string;
  expense_date: string;
}): Promise<ActionState> {
  try {
    await sendJSON("/accounts/expenses/", "POST", payload);
    revalidatePath("/accounts/expenses");
    return { error: null, success: await tr("financials.expenseRecorded") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function recordAdjustmentAction(payload: {
  type: string;
  amount: string;
  note: string;
  branch_id?: number | null;
}): Promise<ActionState> {
  try {
    await sendJSON("/accounts/adjustments/", "POST", payload);
    revalidatePath("/accounts/adjustments");
    return { error: null, success: await tr("financials.adjustmentRecorded") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function generateSettlementAction(payload: {
  branch_id: number;
  date: string;
}): Promise<ActionState> {
  try {
    await sendJSON("/accounts/settlements/", "POST", payload);
    revalidatePath("/accounts/settlements");
    return { error: null, success: await tr("financials.settlementGenerated") };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Marketing: campaigns / coupons / segments ─────────────────────────

export async function saveCampaignAction(
  campaignId: number | null,
  payload: Record<string, unknown>,
): Promise<ActionState> {
  try {
    if (campaignId === null) await sendJSON("/marketing/campaigns/", "POST", payload);
    else await sendJSON(`/marketing/campaigns/${campaignId}/`, "PATCH", payload);
  } catch (err) {
    return await errorState(err);
  }
  revalidatePath("/marketing/campaigns");
  redirect("/marketing/campaigns");
}

export async function deleteCampaignAction(campaignId: number): Promise<ActionState> {
  try {
    await sendJSON(`/marketing/campaigns/${campaignId}/`, "DELETE");
    revalidatePath("/marketing/campaigns");
    return { error: null, success: await tr("marketingX.campaignDeleted") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function saveCouponAction(
  couponId: number | null,
  payload: Record<string, unknown>,
): Promise<ActionState> {
  try {
    if (couponId === null) await sendJSON("/marketing/coupons/", "POST", payload);
    else await sendJSON(`/marketing/coupons/${couponId}/`, "PATCH", payload);
  } catch (err) {
    return await errorState(err);
  }
  revalidatePath("/marketing/coupons");
  redirect("/marketing/coupons");
}

export async function deleteCouponAction(couponId: number): Promise<ActionState> {
  try {
    await sendJSON(`/marketing/coupons/${couponId}/`, "DELETE");
    revalidatePath("/marketing/coupons");
    return { error: null, success: await tr("marketingX.couponDeleted") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function saveSegmentAction(payload: Record<string, unknown>): Promise<ActionState> {
  try {
    await sendJSON("/marketing/segments/", "POST", payload);
    revalidatePath("/marketing/audience");
    return { error: null, success: await tr("marketingX.segmentSaved") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function deleteSegmentAction(segmentId: number): Promise<ActionState> {
  try {
    await sendJSON(`/marketing/segments/${segmentId}/`, "DELETE");
    revalidatePath("/marketing/audience");
    return { error: null, success: await tr("marketingX.segmentDeleted") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function sendSegmentNotificationAction(
  segmentId: number,
  title: string,
  body: string,
): Promise<ActionState> {
  try {
    const res = await sendJSON<{ sent: number }>(`/marketing/segments/${segmentId}/send/`, "POST", {
      title,
      body,
    });
    revalidatePath("/marketing/audience");
    return { error: null, success: await tr("marketingX.sentToN") + ` (${res.sent})` };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Branch manager extras: zone / hours / attendance / reservations ────

export async function saveDeliverySettingsAction(payload: Record<string, unknown>): Promise<ActionState> {
  try {
    await sendJSON("/branch-manager/delivery-settings/", "PATCH", payload);
    revalidatePath("/branch-manager/delivery-zone");
    revalidatePath("/branch-manager/delivery-hours");
    return { error: null, success: await tr("bmExtras.settingsSaved") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function addTimeSlotAction(payload: {
  label: string;
  start_time: string;
  end_time: string;
}): Promise<ActionState> {
  try {
    await sendJSON("/branch-manager/time-slots/", "POST", payload);
    revalidatePath("/branch-manager/delivery-hours");
    return { error: null, success: await tr("bmExtras.slotAdded") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function deleteTimeSlotAction(slotId: number): Promise<ActionState> {
  try {
    await sendJSON(`/branch-manager/time-slots/${slotId}/`, "DELETE");
    revalidatePath("/branch-manager/delivery-hours");
    return { error: null, success: await tr("bmExtras.slotDeleted") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function markAttendanceAction(status: string, note: string): Promise<ActionState> {
  try {
    await sendJSON("/attendance/", "POST", { status, note });
    revalidatePath("/branch-manager/attendance");
    revalidatePath("/rider/attendance");
    return { error: null, success: await tr("bmExtras.attendanceMarked") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function requestReservationAction(
  payload: Record<string, unknown>,
): Promise<ActionState & { reservationId?: number }> {
  try {
    const r = await sendJSON<{ id: number }>("/reservations/", "POST", payload);
    revalidatePath("/customer/reservations");
    return { error: null, success: await tr("bmExtras.reservationRequested"), reservationId: r.id };
  } catch (err) {
    return await errorState(err);
  }
}

export async function setReservationStatusAction(
  reservationId: number,
  status: string,
  extra: { rejection_reason?: string; table_id?: number | null } = {},
): Promise<ActionState> {
  try {
    await sendJSON(`/reservations/${reservationId}/status/`, "POST", { status, ...extra });
    revalidatePath("/", "layout");
    return { error: null, success: await tr("bmExtras.reservationUpdated") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function replyReservationAction(reservationId: number, body: string): Promise<ActionState> {
  if (!body.trim()) return { error: await tr("complaints.emptyMessage") };
  try {
    await sendJSON(`/reservations/${reservationId}/messages/`, "POST", { body });
    revalidatePath("/", "layout");
    return { error: null };
  } catch (err) {
    return await errorState(err);
  }
}

export async function addRamadanTableAction(payload: { name: string; capacity: number }): Promise<ActionState> {
  try {
    await sendJSON("/ramadan/tables/", "POST", payload);
    revalidatePath("/branch-manager/ramadan-bookings");
    return { error: null, success: await tr("bmExtras.tableAdded") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function deleteRamadanTableAction(tableId: number): Promise<ActionState> {
  try {
    await sendJSON(`/ramadan/tables/${tableId}/`, "DELETE");
    revalidatePath("/branch-manager/ramadan-bookings");
    return { error: null, success: await tr("bmExtras.tableDeleted") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function bookRamadanAction(payload: Record<string, unknown>): Promise<ActionState> {
  try {
    await sendJSON("/ramadan/bookings/", "POST", payload);
    revalidatePath("/customer/ramadan-bookings");
    return { error: null, success: await tr("bmExtras.booked") };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Rider location / online status ────────────────────────────────────

export async function setRiderOnlineAction(online: boolean): Promise<ActionState> {
  try {
    await sendJSON("/riders/online/", "POST", { online });
    revalidatePath("/rider/dashboard");
    return { error: null, success: online ? await tr("riderLoc.nowOnline") : await tr("riderLoc.nowOffline") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function pushRiderLocationAction(
  lat: number,
  lng: number,
  orderId?: number,
  accuracy?: number,
): Promise<ActionState> {
  try {
    await sendJSON("/riders/location/", "POST", { lat, lng, order_id: orderId, accuracy });
    return { error: null };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Complaints ────────────────────────────────────────────────────────

export interface ComplaintPayload {
  recipient_role: string;
  category: string;
  subject: string;
  message: string;
  branch_id?: number | null;
  order_id?: number | null;
}

export async function fileComplaintAction(
  payload: ComplaintPayload,
): Promise<ActionState & { complaintId?: number }> {
  try {
    const complaint = await sendJSON<Complaint>("/complaints/", "POST", payload);
    revalidatePath("/", "layout");
    return { error: null, success: await tr("complaints.filed"), complaintId: complaint.id };
  } catch (err) {
    return await errorState(err);
  }
}

export async function replyComplaintAction(
  complaintId: number,
  body: string,
): Promise<ActionState> {
  if (!body.trim()) return { error: await tr("complaints.emptyMessage") };
  try {
    await sendJSON(`/complaints/${complaintId}/messages/`, "POST", { body });
    revalidatePath("/", "layout");
    return { error: null, success: await tr("complaints.replySent") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function setComplaintStatusAction(
  complaintId: number,
  status: string,
): Promise<ActionState> {
  try {
    await sendJSON(`/complaints/${complaintId}/status/`, "POST", { status });
    revalidatePath("/", "layout");
    return { error: null, success: await tr("complaints.statusUpdated") };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Notices (super admin / marketing broadcasts) ──────────────────────

export async function publishNoticeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await sendJSON("/notices/", "POST", {
      title: String(formData.get("title") ?? ""),
      body: String(formData.get("body") ?? ""),
      audience: String(formData.get("audience") ?? "all"),
    });
    revalidatePath("/", "layout");
    return { error: null, success: await tr("notices.published") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function deleteNoticeAction(noticeId: number): Promise<ActionState> {
  try {
    await sendJSON(`/notices/${noticeId}/`, "DELETE");
    revalidatePath("/", "layout");
    return { error: null, success: await tr("notices.deleted") };
  } catch (err) {
    return await errorState(err);
  }
}

// ── Notifications ─────────────────────────────────────────────────────

export async function markNotificationReadAction(id: number): Promise<ActionState> {
  try {
    await sendJSON(`/notifications/${id}/read/`, "POST");
    revalidatePath("/", "layout");
    return { error: null };
  } catch (err) {
    return await errorState(err);
  }
}

export async function markAllNotificationsReadAction(): Promise<ActionState> {
  try {
    await sendJSON("/notifications/read-all/", "POST");
    revalidatePath("/", "layout");
    return { error: null, success: await tr("notifications.allRead") };
  } catch (err) {
    return await errorState(err);
  }
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const newPassword = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  if (newPassword !== confirm) {
    return { error: await tr("errors.passwordMismatch") };
  }
  try {
    await sendJSON("/auth/change-password/", "POST", {
      old_password: String(formData.get("old_password") ?? ""),
      new_password: newPassword,
    });
    return { error: null, success: await tr("toast.passwordChanged") };
  } catch (err) {
    return await errorState(err);
  }
}

// ── PHASE H — reward earning rules (super admin) ───────────────────────
// The API is the authority: these actions only forward and revalidate. Every
// rejection (RBAC, validation, ambiguity 409) surfaces the server's own message.

export async function createEarningRuleAction(values: EarningRuleFormValues): Promise<ActionState> {
  try {
    await sendJSON("/admin/reward-rules/", "POST", values);
  } catch (err) {
    return await errorState(err);
  }
  revalidatePath("/admin/rewards");
  return { error: null, success: await tr("rewards.ruleCreated") };
}

export async function updateEarningRuleAction(id: number, values: EarningRuleFormValues): Promise<ActionState> {
  try {
    await sendJSON(`/admin/reward-rules/${id}/`, "PATCH", values);
  } catch (err) {
    return await errorState(err);
  }
  revalidatePath("/admin/rewards");
  return { error: null, success: await tr("rewards.ruleUpdated") };
}

export async function setEarningRuleActiveAction(id: number, isActive: boolean): Promise<ActionState> {
  try {
    await sendJSON(`/admin/reward-rules/${id}/`, "PATCH", { is_active: isActive });
  } catch (err) {
    return await errorState(err);
  }
  revalidatePath("/admin/rewards");
  return { error: null, success: await tr("rewards.ruleUpdated") };
}

/** Deletes an unused rule; the API archives one the ledger still references. */
export async function deleteEarningRuleAction(id: number): Promise<ActionState> {
  let archived = false;
  try {
    const res = await sendJSON<{ archived?: boolean }>(`/admin/reward-rules/${id}/`, "DELETE");
    archived = Boolean(res?.archived);
  } catch (err) {
    return await errorState(err);
  }
  revalidatePath("/admin/rewards");
  return { error: null, success: await tr(archived ? "rewards.ruleArchivedResult" : "rewards.ruleDeleted") };
}
