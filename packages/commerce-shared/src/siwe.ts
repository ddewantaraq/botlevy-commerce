import { SiweMessage } from "siwe";
import { API_URL, CHAIN_ID } from "./wagmi";

export type SessionRole = "cooker" | "merchant";

async function readJsonOrThrow(res: Response, fallback: string) {
  const text = await res.text();
  let data: { ok?: boolean; message?: string; nonce?: string } = {};
  try {
    data = text ? (JSON.parse(text) as typeof data) : {};
  } catch {
    if (res.status === 429 || /too many/i.test(text)) {
      throw new Error("Server busy (rate limit). Wait a few seconds and try again.");
    }
    throw new Error(fallback);
  }
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Server busy (rate limit). Wait a few seconds and try again.");
    }
    throw new Error(data.message || fallback);
  }
  return data;
}

export async function siweLogin(opts: {
  address: string;
  role: SessionRole;
  statement: string;
  signMessageAsync: (args: { message: string }) => Promise<string>;
}) {
  const nonceRes = await fetch(`${API_URL}/auth/nonce`, {
    credentials: "include",
  });
  const nonceBody = await readJsonOrThrow(nonceRes, "Failed to get SIWE nonce");
  const nonce = nonceBody.nonce;
  if (!nonce) throw new Error("Failed to get SIWE nonce");

  const message = new SiweMessage({
    domain: window.location.host,
    address: opts.address,
    statement: opts.statement,
    uri: window.location.origin,
    version: "1",
    chainId: CHAIN_ID,
    nonce,
  });
  const prepared = message.prepareMessage();
  const signature = await opts.signMessageAsync({ message: prepared });

  const verify = await fetch(`${API_URL}/auth/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: prepared,
      signature,
      role: opts.role,
    }),
  });
  const data = await readJsonOrThrow(verify, "SIWE failed");
  if (!data.ok) {
    throw new Error(data.message || "SIWE failed");
  }
  return data as {
    ok: true;
    address: string;
    role: SessionRole;
    merchant: {
      id: string;
      name: string;
      payTo: string;
      location: string;
    } | null;
  };
}

export async function siweLogout() {
  await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}
