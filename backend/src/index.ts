import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env, debugOllamaEnv } from "./config.js";
import { seedIfEmpty } from "./seed.js";
import { apiLimiter } from "./middleware/rate-limit.js";
import { authRouter } from "./routes/auth.js";
import { merchantsRouter } from "./routes/merchants.js";
import { agentRouter } from "./routes/agent.js";
import { ordersRouter } from "./routes/orders.js";
import { listMerchants, listProducts } from "./store.js";

seedIfEmpty();

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser(env.SESSION_SECRET));
app.use(apiLimiter);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    chainId: env.CHAIN_ID,
    mockUsdc: env.MOCK_USDC_ADDRESS || null,
    ollamaHost: env.OLLAMA_HOST,
    ollamaModel: env.OLLAMA_MODEL,
    ollamaKey: debugOllamaEnv(),
    merchants: listMerchants().length,
    products: listProducts().length,
  });
});

app.use("/auth", authRouter);
app.use("/merchants", merchantsRouter);
app.use("/agent", agentRouter);
app.use("/orders", ordersRouter);

app.listen(env.PORT, () => {
  console.log(`[botlevy-commerce] API http://localhost:${env.PORT}`);
  console.log(`[botlevy-commerce] chainId=${env.CHAIN_ID} merchants=${listMerchants().length}`);
  console.log("[botlevy-commerce] ollama debug", debugOllamaEnv());
});
