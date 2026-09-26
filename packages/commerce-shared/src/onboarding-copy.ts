/** Shared copy for login / network help (Bahasa-first). */
export const LOGIN_HELP = {
  title: "Cara masuk",
  subtitle: "How to sign in",
  steps: [
    {
      title: "Jaringan: BSC Testnet (97)",
      body: "Di MetaMask, pilih jaringan BSC Testnet (chain id 97). Tanpa ini, login dan pembayaran MockUSDC akan gagal.",
    },
    {
      title: "Satu tombol Masuk",
      body: "Ketuk “Masuk dengan MetaMask”. Aplikasi menghubungkan wallet lalu meminta tanda tangan SIWE — tidak perlu dua tombol terpisah.",
    },
    {
      title: "PWA / HP",
      body: "Jika MetaMask app terbuka (deeplink), setujui koneksi lalu kembali ke aplikasi Botlevy yang terpasang. Sign-in dilanjutkan otomatis.",
    },
  ],
  faucetHint:
    "Butuh tBNB testnet: faucet BNB Chain. Import token MockUSDC (6 desimal) sesuai alamat di TRYOUT / env.",
  closeLabel: "Mengerti",
} as const;

export type OnboardingStep = {
  title: string;
  body: string;
  en?: string;
};

export const COOKER_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Selamat datang di Botlevy Cooker",
    body: "Rencanakan masakan dari pantry, dapatkan quote warung, bayar MockUSDC, lalu masak dengan panduan suara.",
    en: "Plan from your pantry, get a warung quote, pay, then cook with voice guidance.",
  },
  {
    title: "Pakai BSC Testnet (97)",
    body: "Sebelum masuk, set MetaMask ke BSC Testnet (chain id 97). Login dan bayar hanya jalan di jaringan ini.",
    en: "Switch MetaMask to BSC Testnet (97) first.",
  },
  {
    title: "Masuk dengan satu ketukan",
    body: "Ketuk “Masuk dengan MetaMask” untuk connect + SIWE. Di HP/PWA, MetaMask app bisa terbuka — kembali ke Botlevy setelah approve.",
    en: "One button: connect + sign. On PWA, return from MetaMask — sign-in resumes.",
  },
  {
    title: "Ngobrol, quote, masak",
    body: "Ceritakan mau masak apa atau bahan di dapur. Cek harga warung, bayar, lalu ikut langkah prep/cook (hands-free di Chrome/PWA).",
    en: "Chat → quote → pay → cook. Hands-free works best in Chrome or the installed PWA.",
  },
];

export const MERCHANT_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Selamat datang, Warung",
    body: "Kelola katalog, terima order MockUSDC, dan fulfill pesanan dari cooker.",
    en: "Manage catalog, receive MockUSDC orders, fulfill from the cooker app.",
  },
  {
    title: "Pakai BSC Testnet (97)",
    body: "Set MetaMask ke BSC Testnet (chain id 97) sebelum masuk. payTo dan pembayaran memakai jaringan ini.",
    en: "MetaMask must be on BSC Testnet (97).",
  },
  {
    title: "Masuk dengan satu ketukan",
    body: "Ketuk “Masuk dengan MetaMask” (connect + SIWE). Di PWA, kembali dari MetaMask app setelah approve.",
    en: "One button login. On PWA, return from MetaMask — SIWE continues.",
  },
  {
    title: "Toko, produk, fulfill",
    body: "Isi nama toko + payTo, tambah produk bertag, lalu fulfill order yang sudah dibayar cooker.",
    en: "Set shop + payTo, add tagged products, fulfill paid orders.",
  },
];
