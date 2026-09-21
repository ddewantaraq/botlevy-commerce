import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env, debugOllamaEnv, uiOrigins } from "./config.js";
import { seedIfEmpty } from "./seed.js";
import { apiLimiter } from "./middleware/rate-limit.js";
import { authRouter } from "./routes/auth.js";
import { merchantsRouter } from "./routes/merchants.js";
import { agentRouter } from "./routes/agent.js";
import { ordersRouter } from "./routes/orders.js";
import { cookerRouter } from "./routes/cooker.js";
import { listMerchants, listProducts } from "./store.js";

seedIfEmpty();

const origins = uiOrigins();
const app = express();
// Railway (and other reverse proxies) set X-Forwarded-For; required for
// express-rate-limit to key per client IP (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || origins.includes(origin)) cb(null, true);
      else cb(null, false);
    },
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
    corsOrigins: origins,
  });
});

app.use("/auth", authRouter);
app.use("/merchants", merchantsRouter);
app.use("/agent", agentRouter);
app.use("/orders", ordersRouter);
app.use("/cooker", cookerRouter);

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`[botlevy-commerce] API http://0.0.0.0:${env.PORT}`);
  console.log(`[botlevy-commerce] chainId=${env.CHAIN_ID} merchants=${listMerchants().length}`);
  console.log(`[botlevy-commerce] CORS`, origins);
  console.log("[botlevy-commerce] ollama debug", debugOllamaEnv());
});
