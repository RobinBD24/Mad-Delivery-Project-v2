"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { Cart, CartItem } from "@/types";

const STORAGE_KEY = "mad-delivery-cart";
const EMPTY_CART: Cart = { branchId: null, branchName: "", items: [] };

/** Unique cart line key = product + variation + crust (req #4), so different
 * sizes AND different thicknesses of the same product are distinct cart lines
 * (Thick and Thin are never merged into one line). */
export function cartLineKey(item: {
  productId: number;
  variationId: number | null;
  variationType?: string;
}): string {
  return `${item.productId}:${item.variationId ?? 0}:${item.variationType ?? ""}`;
}

interface CartContextValue {
  cart: Cart;
  itemCount: number;
  total: number;
  addItem: (branchId: number, branchName: string, item: CartItem) => "added" | "branch-conflict";
  updateQuantity: (lineKey: string, quantity: number) => void;
  updateNote: (lineKey: string, note: string) => void;
  removeItem: (lineKey: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(EMPTY_CART);

  useEffect(() => {
    // Client-only localStorage hydration: server renders EMPTY_CART, client
    // fills from storage after mount. This is a legitimate external-system sync.
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setCart(JSON.parse(raw) as Cart);
    } catch {
      // corrupted storage — start fresh
    }
  }, []);

  const persist = useCallback((next: Cart) => {
    setCart(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const addItem = useCallback(
    (branchId: number, branchName: string, item: CartItem): "added" | "branch-conflict" => {
      if (cart.branchId !== null && cart.branchId !== branchId && cart.items.length > 0) {
        return "branch-conflict";
      }
      const key = cartLineKey(item);
      const existing = cart.items.find((i) => cartLineKey(i) === key);
      const items = existing
        ? cart.items.map((i) =>
            cartLineKey(i) === key ? { ...i, quantity: i.quantity + item.quantity } : i,
          )
        : [...cart.items, item];
      persist({ branchId, branchName, items });
      return "added";
    },
    [cart, persist],
  );

  const updateQuantity = useCallback(
    (lineKey: string, quantity: number) => {
      const items =
        quantity <= 0
          ? cart.items.filter((i) => cartLineKey(i) !== lineKey)
          : cart.items.map((i) => (cartLineKey(i) === lineKey ? { ...i, quantity } : i));
      persist(items.length === 0 ? EMPTY_CART : { ...cart, items });
    },
    [cart, persist],
  );

  const updateNote = useCallback(
    (lineKey: string, note: string) => {
      persist({
        ...cart,
        items: cart.items.map((i) => (cartLineKey(i) === lineKey ? { ...i, foodNote: note } : i)),
      });
    },
    [cart, persist],
  );

  const removeItem = useCallback((lineKey: string) => updateQuantity(lineKey, 0), [updateQuantity]);

  const clearCart = useCallback(() => persist(EMPTY_CART), [persist]);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    const total = cart.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    return { cart, itemCount, total, addItem, updateQuantity, updateNote, removeItem, clearCart };
  }, [cart, addItem, updateQuantity, updateNote, removeItem, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside <CartProvider>");
  return context;
}
