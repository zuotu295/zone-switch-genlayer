const STUDIONET_CHAIN_ID = '0xf22f';
const STUDIONET_CHAIN_PARAMETERS = {
  chainId: STUDIONET_CHAIN_ID,
  chainName: 'GenLayer Studionet',
  nativeCurrency: { name: 'GEN Token', symbol: 'GEN', decimals: 18 },
  rpcUrls: ['https://studio.genlayer.com/api'],
  blockExplorerUrls: ['https://explorer-studio.genlayer.com'],
};

function providerErrorCode(error) {
  return Number(error?.code ?? error?.data?.originalError?.code ?? error?.cause?.code);
}

function isUnknownChainError(error) {
  const message = String(error?.message || error);
  return providerErrorCode(error) === 4902 ||
    /(?:unrecognized|unknown|not added|not found).*chain|chain.*(?:unknown|not found|not added)/i.test(message);
}

function isUnsupportedNetworkMethod(error) {
  const message = String(error?.message || error);
  return providerErrorCode(error) === -32601 || /method not found|unsupported method|method .*not supported/i.test(message);
}

function manualNetworkSwitchError() {
  return new Error('This wallet cannot switch networks from this page. Select GenLayer Studionet (chain ID 61999) in the wallet, then reconnect.');
}

export async function ensureStudionet(provider) {
  if (!provider || typeof provider.request !== 'function') {
    throw new Error('The selected wallet does not expose an EIP-1193 request provider.');
  }

  let chainId = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
  if (chainId === STUDIONET_CHAIN_ID) return chainId;

  const switchNetwork = () => provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: STUDIONET_CHAIN_ID }],
  });

  try {
    await switchNetwork();
  } catch (error) {
    if (isUnsupportedNetworkMethod(error)) throw manualNetworkSwitchError();
    if (!isUnknownChainError(error)) throw error;

    try {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [STUDIONET_CHAIN_PARAMETERS],
      });
    } catch (addError) {
      if (isUnsupportedNetworkMethod(addError)) throw manualNetworkSwitchError();
      throw addError;
    }

    chainId = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
    if (chainId !== STUDIONET_CHAIN_ID) {
      try {
        await switchNetwork();
      } catch (switchError) {
        if (isUnsupportedNetworkMethod(switchError)) throw manualNetworkSwitchError();
        throw switchError;
      }
    }
  }

  chainId = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
  if (chainId !== STUDIONET_CHAIN_ID) {
    throw new Error('The wallet is not connected to GenLayer Studionet (chain ID 61999).');
  }
  return chainId;
}

function inferredName(provider) {
  if (provider?.isMetaMask) return 'MetaMask';
  if (provider?.isOkxWallet || provider?.isOKExWallet) return 'OKX Wallet';
  if (provider?.isCoinbaseWallet) return 'Coinbase Wallet';
  if (provider?.isBraveWallet) return 'Brave Wallet';
  return 'Browser wallet';
}

export function watchInjectedProviders(onProvider) {
  const seen = new Set();
  let sequence = 0;

  const add = (provider, info = {}) => {
    if (!provider || typeof provider.request !== 'function' || seen.has(provider)) return;
    seen.add(provider);
    const name = typeof info.name === 'string' && info.name.trim()
      ? info.name.trim()
      : inferredName(provider);
    const id = info.uuid || info.rdns || (name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + (++sequence));
    onProvider({ id, name, provider });
  };

  const announce = (event) => {
    const detail = event?.detail;
    if (detail?.provider) add(detail.provider, detail.info || {});
  };

  window.addEventListener('eip6963:announceProvider', announce);
  const injected = window.ethereum;
  if (Array.isArray(injected?.providers) && injected.providers.length) {
    injected.providers.forEach((provider) => add(provider));
  } else {
    add(injected);
  }
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  return () => window.removeEventListener('eip6963:announceProvider', announce);
}
