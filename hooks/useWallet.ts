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
    if (isConnected && chainId !== CHAIN_ID) {
      switchChain({ chainId: CHAIN_ID });
    }
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
