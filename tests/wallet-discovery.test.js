import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureStudionet, watchInjectedProviders } from '../src/wallet-discovery.js';

class FakeWindow {
  constructor(ethereum) { this.ethereum = ethereum; this.listeners = new Map(); }
  addEventListener(name, handler) {
    const handlers = this.listeners.get(name) || new Set();
    handlers.add(handler);
    this.listeners.set(name, handlers);
  }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
  dispatchEvent(event) {
    for (const handler of this.listeners.get(event.type) || []) handler(event);
    return true;
  }
}

test('discovers a legacy injected provider', () => {
  const provider = { isMetaMask: true, request: async () => [] };
  globalThis.window = new FakeWindow(provider);
  const found = [];
  const stop = watchInjectedProviders((item) => found.push(item));
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'MetaMask');
  assert.equal(found[0].provider, provider);
  stop();
});

test('discovers multiple legacy providers and de-duplicates EIP-6963 announcements', () => {
  const first = { isMetaMask: true, request: async () => [] };
  const second = { isOkxWallet: true, request: async () => [] };
  globalThis.window = new FakeWindow({ providers: [first, second] });
  const found = [];
  const stop = watchInjectedProviders((item) => found.push(item));
  const duplicate = new Event('eip6963:announceProvider');
  Object.defineProperty(duplicate, 'detail', { value: { info: { uuid: 'metamask', name: 'MetaMask' }, provider: first } });
  const announced = new Event('eip6963:announceProvider');
  Object.defineProperty(announced, 'detail', { value: { info: { uuid: 'walletconnect', name: 'Example Wallet' }, provider: { request: async () => [] } } });
  window.dispatchEvent(duplicate);
  window.dispatchEvent(announced);
  assert.equal(found.length, 3);
  assert.equal(found[1].name, 'OKX Wallet');
  assert.equal(found[2].name, 'Example Wallet');
  stop();
});

test('stops listening after cleanup', () => {
  globalThis.window = new FakeWindow(undefined);
  const found = [];
  const stop = watchInjectedProviders((item) => found.push(item));
  stop();
  const announced = new Event('eip6963:announceProvider');
  Object.defineProperty(announced, 'detail', { value: { info: { name: 'Late Wallet' }, provider: { request: async () => [] } } });
  window.dispatchEvent(announced);
  assert.equal(found.length, 0);
});


function networkProvider({ chainId = '0x1', registered = true, switchError = null } = {}) {
  let currentChainId = chainId;
  let chainRegistered = registered;
  const calls = [];
  return {
    calls,
    async request({ method, params }) {
      calls.push({ method, params });
      if (method === 'eth_chainId') return currentChainId;
      if (method === 'wallet_switchEthereumChain') {
        if (switchError) throw switchError;
        if (!chainRegistered) {
          const error = new Error('Unrecognized chain ID');
          error.code = 4902;
          throw error;
        }
        currentChainId = params[0].chainId;
        return null;
      }
      if (method === 'wallet_addEthereumChain') {
        chainRegistered = true;
        return null;
      }
      const error = new Error('Unexpected provider method: ' + method);
      error.code = -32601;
      throw error;
    },
  };
}

test('keeps an already-connected Studionet wallet without requesting Snap methods', async () => {
  const provider = networkProvider({ chainId: '0xf22f' });
  assert.equal(await ensureStudionet(provider), '0xf22f');
  assert.deepEqual(provider.calls.map((call) => call.method), ['eth_chainId']);
  assert.equal(provider.calls.some((call) => call.method === 'wallet_getSnaps'), false);
});

test('switches an already-added Studionet network through the selected provider', async () => {
  const provider = networkProvider({ chainId: '0x1', registered: true });
  assert.equal(await ensureStudionet(provider), '0xf22f');
  assert.deepEqual(provider.calls.map((call) => call.method), [
    'eth_chainId',
    'wallet_switchEthereumChain',
    'eth_chainId',
    'eth_chainId',
  ]);
});

test('adds Studionet when the wallet reports an unknown chain, then switches to it', async () => {
  const provider = networkProvider({ chainId: '0x1', registered: false });
  assert.equal(await ensureStudionet(provider), '0xf22f');
  const addCall = provider.calls.find((call) => call.method === 'wallet_addEthereumChain');
  assert.deepEqual(addCall.params[0], {
    chainId: '0xf22f',
    chainName: 'GenLayer Studionet',
    nativeCurrency: { name: 'GEN Token', symbol: 'GEN', decimals: 18 },
    rpcUrls: ['https://studio.genlayer.com/api'],
    blockExplorerUrls: ['https://explorer-studio.genlayer.com'],
  });
  assert.equal(provider.calls.some((call) => call.method === 'wallet_getSnaps'), false);
});

test('preserves a user-rejected network switch instead of silently adding a chain', async () => {
  const rejected = new Error('User rejected the request');
  rejected.code = 4001;
  const provider = networkProvider({ chainId: '0x1', switchError: rejected });
  await assert.rejects(ensureStudionet(provider), /User rejected the request/);
  assert.equal(provider.calls.some((call) => call.method === 'wallet_addEthereumChain'), false);
});

test('shows a manual network-switch instruction when the provider lacks chain switching', async () => {
  const unsupported = new Error('Method not found');
  unsupported.code = -32601;
  const provider = networkProvider({ chainId: '0x1', switchError: unsupported });
  await assert.rejects(ensureStudionet(provider), /Select GenLayer Studionet/);
});
