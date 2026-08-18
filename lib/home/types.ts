// Types for the public homepage (Cheez! Pizza / Madchef storefront).
//
// These describe the SHAPE the storefront cards and modals render. The DATA is
// built from the database by lib/services/public-catalog.ts — there is no
// hardcoded catalogue behind them any more.

export type Brand = "cheez" | "madchef";

/**
 * A category identity in the storefront. Formerly a closed union of hardcoded
 * keys ("pizza" | "burgers" | …), which made it impossible to render a category
 * an admin created. It is now the category's database id as a string (or
 * "uncategorized"), so renaming a category keeps its tab and its products.
 */
export type CategoryKey = string;

/** A selectable size/portion with its own price (pizzas, wings, …). */
export interface SizeOption {
  key: string;
  label: string;
  sub?: string;
  price: number;
}

/** An optional paid add-on / topping shown in the size modal. */
export interface AddOn {
  name: string;
  price: number;
}

/** A single-choice option group in the item modal (bun / sauce / flavour). */
export interface ChoiceGroup {
  key: string;
  /** i18n key suffix under home.modal.groups (falls back to `label`). */
  label: string;
  emoji?: string;
  options: string[];
}

export interface MenuItem {
  /** The database product id, as a string (cart lines are keyed by it). */
  id: string;
  name: string;
  description: string;
  /** Base / "from" price (min across enabled variations). Discount applied. */
  price: number;
  /** true when `price` is a "from ৳X" starting price (items with size options). */
  fromPrice?: boolean;
  image: string;
  brand: Brand;
  /** Category key — see CategoryKey. */
  category: CategoryKey;
  /** Sub-heading the card grid groups under (the category's display name). */
  group?: string;
  /**
   * Decorative icon shown when the product has no image (or it fails to load).
   * Derived from the category name, because admin-created categories have no
   * fixed key to look an icon up by.
   */
  emoji?: string;
  /**
   * i18n key suffix under `home.product.badge` — NOT a display string, so the
   * card never renders an untranslated label or a raw key.
   */
  badgeKey?: "popular" | "recommended";
  spicy?: boolean;
  /** When present, the card opens a "Choose Size" modal instead of adding directly. */
  sizes?: SizeOption[];
  /** Non-price choices (flavours / sauces) shown as chips in the modal. */
  options?: string[];
  optionLabel?: string;
  /** Paid add-ons / toppings shown as toggles in the modal. */
  addOns?: AddOn[];
  /** Single-choice option groups (burger bun / sauce). */
  choiceGroups?: ChoiceGroup[];
  /** "What's inside" summary shown in the pizza modal (ABOUT / INGREDIENTS). */
  about?: string;
  /** Minutes, straight from the product row. */
  preparationTime?: number;
  /** Crust policy: "THICK" | "THIN" | "BOTH". */
  variationType?: string;
  /** Owning branch — the storefront cart is branch-scoped like the order API. */
  branchId?: number;
  /**
   * Owning branch NAME. Shown on the card only when the catalogue spans more
   * than one branch (a super admin browsing all branches); a customer sees a
   * single-branch catalogue, so repeating the name on every card would be noise.
   */
  branchName?: string;
}

/** Row in the global nav search index. */
export interface SearchEntry {
  id: string;
  name: string;
  brand: Brand;
  emoji: string;
  price: number;
  fromPrice: boolean;
}

/** A storefront category tab, derived from a real Category row. */
export interface PublicCategory {
  key: CategoryKey;
  /** The category's own name from the database — rendered as-is, never via t(). */
  label: string;
  emoji: string;
  brand: Brand;
}

/** Back-compat alias for the previous exported name. */
export type Category = PublicCategory;

export interface Branch {
  id: number;
  name: string;
  type: "dining" | "cloud" | "closed";
  address: string;
  /** Named delivery coverage zones for this branch. */
  coverage: string[];
}
