import type { Merchant, Product } from "./store.js";
import { newId, resetCatalogFromSeed, listMerchants } from "./store.js";

/** Static substitution map when SKU is OOS. */
export const SUBSTITUTION_MAP: Record<string, string> = {
  shallot: "onion",
  onion: "shallot",
  potato: "sweet_potato",
  sweet_potato: "potato",
  chicken: "chicken_thigh",
  chicken_thigh: "chicken",
};

export const AYAM_SEMUR_FALLBACK = {
  dish: "Ayam Semur",
  steps: [
    "Marinate chicken with salt and pepper.",
    "Sauté shallot/onion until fragrant.",
    "Add chicken and brown lightly.",
    "Add kecap manis, nutmeg, and a splash of water; simmer.",
    "Add potato and cook until tender.",
    "Taste and adjust seasoning; serve hot.",
  ],
  ingredients: [
    { tag: "chicken", name: "Chicken pieces", qty: 500, unit: "g" },
    { tag: "shallot", name: "Shallots", qty: 5, unit: "pcs" },
    { tag: "kecap_manis", name: "Kecap manis", qty: 3, unit: "tbsp" },
    { tag: "nutmeg", name: "Nutmeg", qty: 1, unit: "tsp" },
    { tag: "potato", name: "Potato", qty: 2, unit: "pcs" },
    { tag: "cooking_oil", name: "Cooking oil", qty: 2, unit: "tbsp" },
    { tag: "salt", name: "Salt", qty: 1, unit: "tsp" },
  ],
};

export function seedIfEmpty(defaultPayTo = "0x0000000000000000000000000000000000000001") {
  if (listMerchants().length > 0) return;

  const merchantId = "m_warung_sehat";
  const merchants: Merchant[] = [
    {
      id: merchantId,
      name: "Warung Sehat Menteng",
      payTo: defaultPayTo.toLowerCase(),
      ownerAddress: defaultPayTo.toLowerCase(),
      location: "Jakarta Pusat (seed)",
    },
  ];

  const products: Product[] = [
    {
      id: newId("prod"),
      merchantId,
      name: "Chicken pieces",
      unit: "g",
      price: 45_000, // 0.045 mUSDC per g? Use pack prices instead
      stock: 50,
      tags: ["chicken", "chicken_thigh"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Shallots (bundle)",
      unit: "pcs",
      price: 2_000_000, // 2 mUSDC
      stock: 0, // OOS → substitute onion
      tags: ["shallot"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Onion (bundle)",
      unit: "pcs",
      price: 1_500_000,
      stock: 40,
      tags: ["onion"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Kecap manis bottle",
      unit: "tbsp",
      price: 500_000,
      stock: 100,
      tags: ["kecap_manis"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Nutmeg",
      unit: "tsp",
      price: 300_000,
      stock: 80,
      tags: ["nutmeg"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Potato",
      unit: "pcs",
      price: 800_000,
      stock: 60,
      tags: ["potato", "sweet_potato"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Cooking oil",
      unit: "tbsp",
      price: 200_000,
      stock: 200,
      tags: ["cooking_oil"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Salt pack",
      unit: "tsp",
      price: 100_000,
      stock: 200,
      tags: ["salt"],
    },
  ];

  // Fix chicken to pack price (~5 mUSDC for 500g portion unit sold as pack)
  products[0] = {
    ...products[0],
    name: "Chicken pack (500g)",
    unit: "pack",
    price: 5_000_000,
    stock: 30,
    tags: ["chicken", "chicken_thigh"],
  };

  resetCatalogFromSeed({ merchants, products });
}
