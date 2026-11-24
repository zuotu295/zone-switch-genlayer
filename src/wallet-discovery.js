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
