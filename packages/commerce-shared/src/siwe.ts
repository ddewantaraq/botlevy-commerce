import { SiweMessage } from "siwe";
import { API_URL, CHAIN_ID } from "./wagmi";

export type SessionRole = "cooker" | "merchant";

export async function siweLogin(opts: {
  address: string;
  role: SessionRole;
  statement: string;
  signMessageAsync: (args: { message: string }) => Promise<string>;
}) {
  const nonceRes = await fetch(`${API_URL}/auth/nonce`, { credentials: "include" });
  const { nonce } = await nonceRes.json();

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
  const data = await verify.json();
  if (!verify.ok || !data.ok) {
    throw new Error(data.message || "SIWE failed");
  }
  return data as {
    ok: true;
    address: string;
    role: SessionRole;
    merchant: { id: string; name: string; payTo: string; location: string } | null;
  };
}

export async function siweLogout() {
  await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
}
