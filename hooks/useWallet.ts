"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { injected } from "@wagmi/connectors";
import { useAccount, useChainId, useConnect, useSwitchChain } from "wagmi";
import { CHAIN_ID } from "@/lib/constants";
import { isMiniPay } from "@/lib/minipay";

export function useWallet() {
  const { address, isConnected } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const autoConnectedRef = useRef(false);
  const isReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const isMiniPayUser = isReady && isMiniPay();

  useEffect(() => {
    if (isMiniPayUser && !isConnected && !autoConnectedRef.current) {
      autoConnectedRef.current = true;
      connect({ connector: injected() });
    }
  }, [connect, isConnected, isMiniPayUser]);

  useEffect(() => {
    if (!isConnected || chainId === CHAIN_ID) return;

    const trySwitch = async () => {
      // prefer wagmi switchChain if available
      try {
        if (switchChain) {
          // wagmi's switchChain expects the chain id (number)
          await switchChain(CHAIN_ID as any);
          return;
        }
      } catch (err: any) {
        // fallthrough to wallet RPC method if switchChain failed
        console.debug("useWallet: wagmi switchChain failed", err?.message ?? err);
      }

      // Fallback: use the provider RPC calls to switch/add chain (MetaMask)
      try {
        const provider = (window as any).ethereum as any;
        if (!provider) return;

        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
        });
      } catch (switchErr: any) {
        // 4902 = chain not added to wallet
        try {
          const provider = (window as any).ethereum as any;
          if (!provider) return;

          if (CHAIN_ID === 42220) {
            await provider.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: `0x${CHAIN_ID.toString(16)}`,
                  chainName: "Celo Mainnet",
                  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
                  rpcUrls: ["https://forno.celo.org"],
                  blockExplorerUrls: ["https://celoscan.io"],
                },
              ],
            });
          } else {
            // Generic fallback: try switching again
            await provider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
            });
          }
        } catch (addErr) {
          console.debug("useWallet: provider add/switch chain failed", addErr);
        }
      }
    };

    void trySwitch();
  }, [chainId, isConnected, switchChain]);

  const connectWallet = () => {
    connect({ connector: injected() });
  };

  return {
    address,
    isReady,
    isConnected,
    isConnecting,
    isMiniPayUser,
    isCorrectChain: chainId === CHAIN_ID,
    connectWallet,
  };
}
