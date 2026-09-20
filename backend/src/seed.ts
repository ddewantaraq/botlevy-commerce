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
    { tag: "shallot", name: "Shallots", qty: 5, unit: "biji" },
    { tag: "kecap_manis", name: "Kecap manis", qty: 3, unit: "sdm" },
    { tag: "nutmeg", name: "Nutmeg", qty: 1, unit: "sdt" },
    { tag: "potato", name: "Potato", qty: 2, unit: "biji" },
    { tag: "cooking_oil", name: "Cooking oil", qty: 2, unit: "sdm" },
    { tag: "salt", name: "Salt", qty: 1, unit: "sdt" },
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
      name: "Ayam (per kg)",
      unit: "kg",
      price: 5_000_000,
      stock: 30,
      tags: ["chicken", "chicken_thigh"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Bawang merah",
      unit: "g",
      price: 2_000,
      stock: 0, // OOS → substitute onion
      tags: ["shallot"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Bawang bombay",
      unit: "g",
      price: 1_500,
      stock: 40,
      tags: ["onion"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Kecap manis",
      unit: "sdm",
      price: 500_000,
      stock: 100,
      tags: ["kecap_manis"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Pala",
      unit: "sdt",
      price: 300_000,
      stock: 80,
      tags: ["nutmeg"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Kentang",
      unit: "kg",
      price: 800_000,
      stock: 60,
      tags: ["potato", "sweet_potato"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Minyak goreng",
      unit: "ml",
      price: 200_000,
      stock: 200,
      tags: ["cooking_oil"],
    },
    {
      id: newId("prod"),
      merchantId,
      name: "Garam",
      unit: "g",
      price: 100_000,
      stock: 200,
      tags: ["salt"],
    },
  ];

  resetCatalogFromSeed({ merchants, products });
}
