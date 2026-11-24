import { feeOptions } from './fees.js';
import { createApp, ref, computed, onMounted, onUnmounted, markRaw } from 'vue/dist/vue.esm-bundler.js';
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant, transactionsStatusNumberToName } from 'genlayer-js/types';
import { ensureStudionet, watchInjectedProviders } from './wallet-discovery.js';
import source from '../contracts/zone_switch.py?raw';
import demo from './demo.json';
import './style.css';

const network = createClient({ chain: studionet });
const explorer = 'https://explorer-studio.genlayer.com/tx/';
const validAddress = /^0x[0-9a-fA-F]{40}$/;
const terminal = new Set(['Finalized', 'Failed', 'Canceled']);
const storage = 'zoneswitch-track-v1';
const chainHex = '0xf22f';
const query = new URLSearchParams(location.search);

createApp({
  setup() {
    const selected = query.get('route');
    const address = ref(validAddress.test(selected) ? selected : demo.address);
    const route = ref(null);
    const events = ref([]);
    const wallet = ref('');
    const balance = ref('');
    const walletMode = ref('');
    const walletChain = ref('');
    const walletProviders = ref([]);
    const candidate = ref('');
    const title = ref('');
    const problem = ref('');
    const notice = ref('');
    const loading = ref(false);
    const busy = ref(false);
    const pending = ref([]);
    const older = ref(0);
    const mode = ref('directory');
    const inputAddress = ref('');
    let signer;
    let activeProvider;
    let providerHandlers;
    let stopProviderDiscovery;
    let request = 0;
    let polling = false;
    const isOwner = computed(() => !!wallet.value && wallet.value.toLowerCase() === route.value?.owner.toLowerCase());
    const unsettled = computed(() => pending.value.some((entry) => !terminal.has(entry.status) && (entry.kind === 'create' || entry.address === address.value)));
    const known = computed(() => address.value === demo.address ? demo.transactions : {});
    const descriptions = {
      AUTHENTICATED: 'Validated address', SERVFAIL: 'Resolver returned SERVFAIL', NOT_FOUND: 'Name does not exist',
      NO_DIRECT_A: 'No direct A record', UNAUTHENTICATED: 'DNSSEC authentication missing', UNAVAILABLE: 'No usable resolver response',
    };

    function save() {
      try { localStorage.setItem(storage, JSON.stringify(pending.value)); } catch {}
    }

    function removeProviderListeners() {
      if (!activeProvider || !providerHandlers) return;
      const remove = activeProvider.removeListener?.bind(activeProvider) || activeProvider.off?.bind(activeProvider);
      remove?.('accountsChanged', providerHandlers.accountsChanged);
      remove?.('chainChanged', providerHandlers.chainChanged);
      providerHandlers = undefined;
      activeProvider = undefined;
    }

    function disconnect() {
      removeProviderListeners();
      signer = undefined;
      wallet.value = '';
      balance.value = '';
      walletMode.value = '';
      walletChain.value = '';
    }

    async function ensureWalletNetwork() {
      if (walletMode.value !== 'injected') return;
      if (!activeProvider || !signer) throw new Error('Reconnect your browser wallet before signing.');
      walletChain.value = await ensureStudionet(activeProvider);
    }

    async function connectWallet(item) {
      if (busy.value) return;
      busy.value = true;
      problem.value = '';
      try {
        const provider = item.provider;
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        if (!Array.isArray(accounts) || !validAddress.test(accounts[0] || '')) throw new Error('The wallet did not return a valid account.');
        const actualChain = await ensureStudionet(provider);
        const client = createClient({ chain: studionet, account: accounts[0], provider });
        removeProviderListeners();
        activeProvider = provider;
        signer = client;
        wallet.value = accounts[0];
        balance.value = '';
        walletMode.value = 'injected';
        walletChain.value = actualChain;

        const accountsChanged = async (nextAccounts) => {
          if (activeProvider !== provider) return;
          if (!Array.isArray(nextAccounts) || !validAddress.test(nextAccounts[0] || '')) {
            disconnect();
            notice.value = 'Wallet disconnected.';
            return;
          }
          wallet.value = nextAccounts[0];
          signer = createClient({ chain: studionet, account: nextAccounts[0], provider });
          balance.value = '';
          try {
            walletChain.value = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
            if (walletChain.value !== chainHex) problem.value = 'Switch your wallet to Stable Studionet (61999) before signing.';
          } catch (error) { problem.value = String(error.message || error); }
        };
        const chainChanged = (nextChain) => {
          if (activeProvider !== provider) return;
          walletChain.value = String(nextChain).toLowerCase();
          if (walletChain.value !== chainHex) problem.value = 'Switch your wallet to Stable Studionet (61999) before signing.';
          else if (problem.value.startsWith('Switch your wallet')) problem.value = '';
        };
        provider.on?.('accountsChanged', accountsChanged);
        provider.on?.('chainChanged', chainChanged);
        providerHandlers = { accountsChanged, chainChanged };
        notice.value = 'Connected ' + item.name + '. Transactions require wallet confirmation.';
      } catch (error) {
        problem.value = String(error.shortMessage || error.message || error).slice(0, 230);
      } finally { busy.value = false; }
    }

    async function createWallet() {
      if (busy.value) return;
      busy.value = true;
      problem.value = '';
      try {
        const account = createAccount();
        const client = createClient({ chain: studionet, account });
        await client.request({ method: 'sim_fundAccount', params: [account.address, 10 ** 18] });
        removeProviderListeners();
        signer = client;
        wallet.value = account.address;
        walletMode.value = 'test';
        walletChain.value = chainHex;
        const wei = BigInt(await client.request({ method: 'eth_getBalance', params: [account.address, 'latest'] }));
        balance.value = (Number(wei) / 1e18).toLocaleString('en', { maximumFractionDigits: 4 });
        notice.value = 'Temporary test wallet created. Its key stays in this tab only.';
      } catch (error) {
        problem.value = String(error.shortMessage || error.message).slice(0, 230);
      } finally { busy.value = false; }
    }

    async function refresh() {
      const current = ++request;
      const target = address.value;
      loading.value = true;
      problem.value = '';
      try {
        const read = async (functionName, args) => JSON.parse(await network.readContract({
          address: target, functionName, args, transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
        }));
        const [record, history] = await Promise.all([read('route', []), read('history', [older.value])]);
        if (current === request) {
          route.value = record;
          events.value = history;
        }
      } catch (error) {
        if (current === request) {
          route.value = null;
          events.value = [];
          problem.value = String(error.shortMessage || error.message).slice(0, 230);
        }
      } finally {
        if (request === current) loading.value = false;
      }
    }

    async function open(target) {
      if (!validAddress.test(target)) { problem.value = 'Enter a valid contract address with its original casing.'; return; }
      address.value = target;
      route.value = null;
      events.value = [];
      older.value = 0;
      mode.value = 'directory';
      history.replaceState(null, '', '?route=' + target);
      await refresh();
    }

    async function poll() {
      if (polling) return;
      polling = true;
      try {
        for (const entry of pending.value.filter((item) => !terminal.has(item.status))) {
          try {
            const tx = await network.getTransaction({ hash: entry.hash });
            const state = tx.statusName || tx.status_name || transactionsStatusNumberToName[tx.status] || tx.status;
            entry.detail = state;
            if (state === 'CANCELED') entry.status = 'Canceled';
            else if (state !== 'FINALIZED') entry.status = state === 'ACCEPTED' ? 'Accepted' : 'In consensus';
            else {
              const leader = tx.consensus_data?.leader_receipt?.find((item) => item.mode === 'leader');
              if (!leader) continue;
              if (leader.execution_result !== 'SUCCESS') {
                entry.status = 'Failed';
                entry.detail = leader.result?.payload || 'Execution rejected';
                continue;
              }
              if (entry.kind === 'create') {
                const created = tx.data?.contract_address ?? tx.to_address;
                if (!validAddress.test(created)) continue;
                entry.address = created;
                if (mode.value === 'create') await open(created);
              } else if (entry.address === address.value) {
                older.value = 0;
                await refresh();
              }
              entry.status = 'Finalized';
              entry.detail = 'Execution succeeded. See the on-chain decision.';
            }
          } catch { entry.detail = 'Waiting for the Studionet RPC'; }
        }
        save();
      } finally { polling = false; }
    }

    async function send(kind) {
      if (!signer || busy.value || unsettled.value || (kind === 'switch' && !isOwner.value)) return;
      const host = candidate.value.trim().toLowerCase();
      const args = kind === 'create' ? [title.value.trim()] : [host, route.value.revision];
      const action = kind === 'create' ? 'Create route directory: ' + args[0] : 'Verify and conditionally activate: ' + host;
      if (!confirm('Stable Studionet (61999)\nSigner: ' + wallet.value + '\n' + action)) return;
      busy.value = true;
      problem.value = '';
      try {
        await ensureWalletNetwork();
        const hash = kind === 'create'
          ? await signer.deployContract({ code: source, args, leaderOnly: false, fees: await feeOptions(signer) })
          : await signer.writeContract({ address: address.value, functionName: 'switch', args, leaderOnly: false, value: 0n, fees: await feeOptions(signer) });
        pending.value.unshift({ hash, kind, address: address.value, status: 'Submitted', detail: args[0] });
        save();
        void poll();
      } catch (error) { problem.value = String(error.shortMessage || error.message).slice(0, 230); }
      finally { busy.value = false; }
    }

    async function copy(value) {
      try { await navigator.clipboard.writeText(value); notice.value = 'Copied.'; }
      catch { notice.value = value; }
    }

    let timer;
    onMounted(() => {
      stopProviderDiscovery = watchInjectedProviders((item) => {
        if (!walletProviders.value.some((entry) => entry.provider === item.provider)) {
          walletProviders.value.push({ ...item, provider: markRaw(item.provider) });
        }
      });
      try {
        const cached = JSON.parse(localStorage.getItem(storage) || '[]');
        if (Array.isArray(cached)) pending.value = cached;
      } catch {}
      void refresh();
      void poll();
      timer = setInterval(poll, 7000);
    });
    onUnmounted(() => {
      clearInterval(timer);
      stopProviderDiscovery?.();
      removeProviderListeners();
    });
    return { address, route, events, wallet, balance, walletMode, walletChain, walletProviders, candidate, title, problem, notice, loading, busy, pending, older, mode,
      inputAddress, isOwner, unsettled, known, descriptions, explorer, demo, open, refresh, createWallet, connectWallet, disconnect, send, copy };
  },
  template: `
    <header class="mast"><a class="brand" href="./"><span>◩</span> ZoneSwitch</a><small>Stable Studionet / 61999</small>
      <div class="wallet-controls" v-if="!wallet">
        <button v-for="item in walletProviders" :key="item.id" @click="connectWallet(item)" :disabled="busy">Connect {{item.name}}</button>
        <button @click="createWallet" :disabled="busy">Use test wallet</button>
      </div>
      <div class="wallet-controls" v-else><span class="wallet-pill">{{walletMode==='test'?'Test wallet':'Connected wallet'}}</span><button @click="disconnect" :disabled="busy">Disconnect</button></div>
    </header>
    <main>
      <div class="wallet" v-if="wallet"><strong>{{walletMode==='test'?'Session test wallet':'Browser wallet'}}</strong><code>{{wallet}}</code><span v-if="walletMode==='test'">{{balance}} test GEN</span><span v-else>Stable Studionet · {{walletChain==='0xf22f'?'connected':'wrong network'}}</span><small v-if="walletMode==='test'">Test key is held in memory and is not restored after reload.</small><small v-else>Signing is requested by your wallet. The application never receives your private key.</small></div>
      <nav aria-label="Directory navigation"><button @click="open(demo.address)">Open public demo</button><button @click="mode='create';problem=''">New directory</button><form @submit.prevent="open(inputAddress.trim())"><label class="sr" for="address">Contract address</label><input id="address" v-model="inputAddress" placeholder="Contract address"><button>Open</button></form></nav>
      <p v-if="problem" class="feedback error" role="alert">{{problem}}</p><p v-if="notice" class="feedback" role="status">{{notice}}</p>
      <section v-if="mode==='create'" class="creation"><h1>New route directory</h1><p>Deploy a directory owned by your connected wallet or temporary test wallet, then validate its first hostname.</p><form @submit.prevent="send('create')"><label for="title">Directory name</label><input id="title" v-model="title" minlength="3" maxlength="64" required><button class="accent" :disabled="!wallet || busy || unsettled">Deploy directory</button></form><p v-if="!wallet">Connect a browser wallet or use a temporary test wallet to deploy.</p></section>
      <template v-else>
      <p v-if="loading && !route" role="status">Reading finalized route…</p>
      <section v-if="route" class="route">
        <div><p class="overline">{{route.title}}</p><h1>{{route.hostname || 'No active route'}}</h1><p>Active service entry · Revision {{route.revision}}</p><button v-if="route.hostname" class="accent" @click="copy('https://' + route.hostname)">Copy service URL</button><button @click="copy(address)">Copy contract address</button> <a v-if="address===demo.address && demo.deployment" :href="explorer+demo.deployment" target="_blank" rel="noreferrer">Deployment ↗</a></div>
        <aside><p class="overline">Route maintainer</p><code>{{route.owner}}</code><p>The resolver checks establish DNSSEC validation of a direct IPv4 address at verification time.</p></aside>
      </section>
      <section v-if="route" class="proposal">
        <div><h2>Change the active entry</h2><p>The maintainer proposes a hostname. Both resolvers must return an authenticated direct A record for the contract to switch.</p></div>
        <form v-if="isOwner" @submit.prevent="send('switch')"><label for="host">Candidate hostname</label><input id="host" v-model="candidate" placeholder="cloudflare.com" maxlength="253" required><button class="accent" :disabled="busy || unsettled">Verify and switch</button></form>
        <p v-else>The maintainer wallet can make changes. To try both outcomes, create your own directory and submit <code>cloudflare.com</code> followed by <code>dnssec-failed.org</code>.</p>
      </section>
      <section v-if="route" class="timeline">
        <div class="head"><h2>Switch history</h2><button @click="refresh">Refresh</button></div>
        <p v-if="!events.length">No finalized attempts yet.</p>
        <article v-for="event in events" :key="event.id" :class="event.decision.toLowerCase()">
          <div class="event-head"><span>#{{event.id}} · {{event.decision}}</span><time>{{event.utc.slice(0,16).replace('T',' ')}} UTC</time></div>
          <h3>{{event.candidate}}</h3><code>{{event.actor}}</code>
          <dl><div v-for="(verdict,resolver) in event.checks" :key="resolver"><dt>{{resolver}}</dt><dd>{{descriptions[verdict]}}</dd></div></dl>
          <p>{{event.decision === 'SWITCHED' ? 'Clients now use' : 'Clients continue using'}} <strong>{{event.active || 'no route'}}</strong> · revision {{event.revision}}.</p>
          <a v-if="known[event.id]" :href="explorer+known[event.id]" target="_blank" rel="noreferrer">Finalized transaction ↗</a>
        </article>
        <button v-if="older" @click="older=0;refresh()">Newest</button><button v-if="events.at(-1)?.id > 1" @click="older=events.at(-1).id;refresh()">Older attempts</button>
      </section>
      </template>
      <section v-if="pending.length" class="transactions" aria-live="polite"><h2>Your transactions</h2><div v-for="entry in pending" :key="entry.hash"><strong>{{entry.kind==='create'?'Deploy directory':'Check candidate'}} · {{entry.status}}</strong><p>{{entry.detail}}</p><a :href="explorer+entry.hash" target="_blank" rel="noreferrer">Explorer ↗</a> <button v-if="entry.status==='Finalized' && entry.address" @click="open(entry.address)">Open directory</button></div></section>
    </main>
    <footer>ZoneSwitch <span>External DNS observations settled on GenLayer.</span></footer>`,
}).mount('#app');
