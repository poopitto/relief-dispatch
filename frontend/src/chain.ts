import { defineChain } from "viem";

// Public GenLayer Studionet configuration for Lifeline / relief-dispatch.
// Values come from the committed .env (see .env.example); the fallbacks keep
// the deployed address fixed if a build runs without an env file.
export const GENLAYER_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 61999);
export const GENLAYER_RPC_URL =
  import.meta.env.VITE_RPC_URL ?? "https://studio.genlayer.com/api";
export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ??
  "0xB2289703ea0fE1ffEC49cf4708bD002052F31d5a") as `0x${string}`;

export const genLayerStudionet = defineChain({
  id: GENLAYER_CHAIN_ID,
  name: "GenLayer Studionet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: {
    default: { http: [GENLAYER_RPC_URL] },
    public: { http: [GENLAYER_RPC_URL] },
  },
  testnet: true,
});
