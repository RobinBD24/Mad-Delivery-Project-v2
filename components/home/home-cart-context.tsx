"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { Brand } from "@/lib/home/types";

/** Normalised payload sent to the cart when a product (or a configured size) is added. */
export interface CartAddInput {
  /** Base menu-item id. */
  id: string;
  name: string;
  unitPrice: number;
  brand: Brand;
  /** Owning branch — one order belongs to exactly one branch. */
  branchId?: number;
  branchName?: string;
  /** Distinguishes a configured variant (size / flavour / add-ons) of the same item. */
  variant?: string;
  image?: string;
  emoji?: string;
  qty?: number;
}

export interface HomeCartLine {
  /** Unique per item + variant. */
  lineId: string;
  name: string;
  unitPrice: number;
  brand: Brand;
  branchId?: number;
  branchName?: string;
  variant?: string;
  image?: string;
  emoji?: string;
  qty: number;
}

/** Last-added payload consumed by the success toast. */
export interface LastAdded {
  name: string;
  qty: number;
  unitPrice: number;
  /** Monotonic id so repeated adds re-trigger the toast. */
  seq: number;
}

/** A blocked add: the cart already belongs to a different branch. */
export interface BranchSwitchRequest {
  input: CartAddInput;
  currentBranchName: string;
  nextBranchName: string;
}

interface HomeCartValue {
  lines: HomeCartLine[];
  count: number;
  total: number;
  isOpen: boolean;
  lastAdded: LastAdded | null;
  brand: Brand;
  setBrand: (brand: Brand) => void;
  add: (input: CartAddInput) => void;
  /** The branch this cart is locked to, or null when the cart is empty. */
  cartBranchId: number | null;
  cartBranchName: string | null;
  /** Set when an add was refused because it belongs to another branch. */
  pendingBranchSwitch: BranchSwitchRequest | null;
  confirmBranchSwitch: () => void;
  cancelBranchSwitch: () => void;
  remove: (lineId: string) => void;
  setQty: (lineId: string, qty: number) => void;
  clear: () => void;
  openCart: () => void;
  closeCart: () => void;
  dismissToast: () => void;
}

const HomeCartContext = createContext<HomeCartValue | null>(null);

function lineKey(input: CartAddInput): string {
  return input.variant ? `${input.id}::${input.variant}` : input.id;
}

/**
 * Client-side cart for the public homepage. Purely local state — the reference
 * site is a showcase menu, so ordering funnels to the phone line / login.
 * Lines are keyed by item + variant so sized items (pizzas, wings) stay distinct.
 * Also owns the active brand tab so the navbar search can switch the menu.
 */
export function HomeCartProvider({
  children,
  initialBrand = "cheez",
}: {
  children: ReactNode;
  /**
   * Which brand tab opens first. Previously hardcoded to "cheez", which meant a
   * catalogue containing only Madchef products rendered an empty grid and the
   * "No items found" message — the products were loaded and eligible, just
   * filtered out by a tab nobody had chosen. The server picks the first brand
   * that actually has products (see app/page.tsx).
   */
  initialBrand?: Brand;
}) {
  const [lines, setLines] = useState<HomeCartLine[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [brand, setBrand] = useState<Brand>(initialBrand);
  const [lastAdded, setLastAdded] = useState<LastAdded | null>(null);
  const [pendingBranchSwitch, setPendingBranchSwitch] = useState<BranchSwitchRequest | null>(null);

  // One order belongs to exactly one branch, so the FIRST item locks the cart to
  // its branch. Derived from the lines rather than stored separately, so it can
  // never disagree with what is actually in the cart.
  const cartBranchId = lines.find((l) => l.branchId != null)?.branchId ?? null;
  const cartBranchName = lines.find((l) => l.branchName)?.branchName ?? null;

  const addLine = useCallback((input: CartAddInput) => {
    const lineId = lineKey(input);
    const qty = Math.max(1, input.qty ?? 1);
    setLines((prev) => {
      const existing = prev.find((l) => l.lineId === lineId);
      if (existing) {
        return prev.map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + qty } : l));
      }
      return [
        ...prev,
        {
          lineId,
          name: input.name,
          unitPrice: input.unitPrice,
          brand: input.brand,
          branchId: input.branchId,
          branchName: input.branchName,
          variant: input.variant,
          image: input.image,
          emoji: input.emoji,
          qty,
        },
      ];
    });
    setLastAdded((prev) => ({
      name: input.variant ? `${input.name} · ${input.variant}` : input.name,
      qty,
      unitPrice: input.unitPrice,
      seq: (prev?.seq ?? 0) + 1,
    }));
  }, []);

  /**
   * Public add. Refuses — rather than silently mixing — when the cart already
   * belongs to a different branch, and surfaces the conflict so the UI can offer
   * "clear the cart and switch" or "cancel". Items with no branch (a legacy or
   * guest showcase item) never trigger the guard.
   */
  const add = useCallback(
    (input: CartAddInput) => {
      if (
        input.branchId != null &&
        cartBranchId != null &&
        input.branchId !== cartBranchId
      ) {
        setPendingBranchSwitch({
          input,
          currentBranchName: cartBranchName ?? "",
          nextBranchName: input.branchName ?? "",
        });
        return;
      }
      addLine(input);
    },
    [addLine, cartBranchId, cartBranchName],
  );

  const confirmBranchSwitch = useCallback(() => {
    setPendingBranchSwitch((pending) => {
      if (pending) {
        // Clearing and adding in one step, so the cart is never briefly mixed.
        setLines([]);
        addLine(pending.input);
      }
      return null;
    });
  }, [addLine]);

  const cancelBranchSwitch = useCallback(() => setPendingBranchSwitch(null), []);

  const remove = useCallback((lineId: string) => {
    setLines((prev) => prev.filter((l) => l.lineId !== lineId));
  }, []);

  const setQty = useCallback((lineId: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.lineId !== lineId)
        : prev.map((l) => (l.lineId === lineId ? { ...l, qty } : l)),
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);
  const dismissToast = useCallback(() => setLastAdded(null), []);

  const value = useMemo<HomeCartValue>(() => {
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const total = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    return {
      lines,
      cartBranchId,
      cartBranchName,
      pendingBranchSwitch,
      confirmBranchSwitch,
      cancelBranchSwitch,
      count,
      total,
      isOpen,
      lastAdded,
      brand,
      setBrand,
      add,
      remove,
      setQty,
      clear,
      openCart: () => setOpen(true),
      closeCart: () => setOpen(false),
      dismissToast,
    };
  }, [
    lines, isOpen, lastAdded, brand, add, remove, setQty, clear, dismissToast,
    cartBranchId, cartBranchName, pendingBranchSwitch, confirmBranchSwitch, cancelBranchSwitch,
  ]);

  return <HomeCartContext.Provider value={value}>{children}</HomeCartContext.Provider>;
}

export function useHomeCart(): HomeCartValue {
  const ctx = useContext(HomeCartContext);
  if (!ctx) throw new Error("useHomeCart must be used inside <HomeCartProvider>");
  return ctx;
}
