"use client";

type EthereumProvider = {
  isMiniPay?: boolean;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  return window.ethereum?.isMiniPay === true;
}

export function isEthereumAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.ethereum);
}

export function formatAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatCelo(wei: bigint, decimals = 4): string {
  const val = Number(wei) / 1e18;
  return val.toFixed(decimals);
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Expired";

  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
