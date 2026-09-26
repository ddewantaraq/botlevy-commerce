export type Product = {
  id: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  tags: string[];
};

export type Order = {
  id: string;
  status: string;
  total: number;
  txHash: string;
  payer: string;
  payTo: string;
  lines: Array<{ name: string; qty: number }>;
  createdAt: string;
};

export type Merchant = {
  id: string;
  name: string;
  payTo: string;
  location: string;
};

export type ProductDraft = {
  name: string;
  unit: string;
  price: string;
  stock: string;
  tags: string;
};

export const emptyProduct: ProductDraft = {
  name: "",
  unit: "kg",
  price: "1.00",
  stock: "10",
  tags: "",
};
