import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Product } from '@shared/types';
import {
  getVariantPriceOre,
  getFixedWeight,
  isBreadProduct,
  parseBreadQuantity,
} from '../utils/productVariantPrices';
import {
  readPersistentValue,
  removePersistentValue,
  STORAGE_KEYS,
  STORAGE_TTL_MS,
  writePersistentValue,
} from '../utils/browserStorage';

export interface CartItem {
  productId: string;
  productName: string;
  price: number; // in öre (divide by 100 for display)
  quantity: number;
  image?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, quantity?: number, option?: string) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number; // in öre
  getItemCount: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function isStoredCart(value: unknown): value is CartItem[] {
  return Array.isArray(value)
    && value.length <= 100
    && value.every((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const candidate = item as Partial<CartItem>;
      return typeof candidate.productId === 'string'
        && candidate.productId.length > 0
        && candidate.productId.length <= 300
        && typeof candidate.productName === 'string'
        && candidate.productName.length > 0
        && candidate.productName.length <= 300
        && Number.isSafeInteger(candidate.price)
        && (candidate.price ?? -1) >= 0
        && Number.isSafeInteger(candidate.quantity)
        && (candidate.quantity ?? 0) >= 1
        && (candidate.quantity ?? 0) <= 50
        && (candidate.image == null
          || (typeof candidate.image === 'string' && candidate.image.length <= 2_048));
    });
}

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      return readPersistentValue(
        STORAGE_KEYS.cart,
        isStoredCart,
        STORAGE_TTL_MS.cart,
        (raw) => {
          try { return JSON.parse(raw) as unknown as CartItem[]; } catch { return null; }
        }
      ) ?? [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (items.length === 0) {
      removePersistentValue(STORAGE_KEYS.cart);
      return;
    }
    writePersistentValue(STORAGE_KEYS.cart, items, STORAGE_TTL_MS.cart);
  }, [items]);

  const addItem = (product: Product, quantity: number = 1, option?: string) => {
    setItems((prevItems) => {
      const fixedWeight = getFixedWeight(product);
      const resolvedOption = option ?? fixedWeight ?? undefined;
      const uniqueId = resolvedOption ? `${product.id}-${resolvedOption}` : product.id;
      const displayName = resolvedOption ? `${product.name} - ${resolvedOption}` : product.name;

      const unitPriceOre =
        getVariantPriceOre(product, resolvedOption ?? '') ??
        product.price;

      const lineQuantity = isBreadProduct(product) && resolvedOption
        ? parseBreadQuantity(resolvedOption)
        : quantity;

      const existingItem = prevItems.find((item) => item.productId === uniqueId);

      if (existingItem) {
        return prevItems.map((item) =>
          item.productId === uniqueId
            ? { ...item, quantity: item.quantity + lineQuantity }
            : item
        );
      }

      return [
        ...prevItems,
        {
          productId: uniqueId,
          productName: displayName,
          price: unitPriceOre,
          quantity: lineQuantity,
          image: product.image,
        },
      ];
    });
  };

  const removeItem = (productId: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.productId !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }

    setItems((prevItems) =>
      prevItems.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const getTotal = (): number => {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const getItemCount = (): number => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  };

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        getTotal,
        getItemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
