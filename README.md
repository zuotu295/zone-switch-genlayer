# ZoneSwitch

ZoneSwitch is an on-chain service route directory. Directory maintainers select an entry hostname and clients read its active revision from GenLayer. Publishing a candidate requires two public DNS resolvers to report a DNSSEC-authenticated direct IPv4 record. A blocked candidate leaves the published route intact.

- [Open ZoneSwitch](https://zuotu295.github.io/zone-switch-genlayer/)
- [Stable Studionet acceptance evidence](EVIDENCE.md)

## Wallets

The application supports injected browser wallets through EIP-6963 provider discovery and the EIP-1193 provider API. Connect MetaMask, OKX Wallet or another compatible extension, approve the account request, and connect to Stable Studionet (chain ID 61999). The wallet signs deployment and route-switch transactions; the application does not receive or store private keys. Account and network changes are reflected in the interface.

A temporary test wallet is also available for demonstrations. It is generated in the browser, funded by the Studio test faucet and held only in tab memory. It is not restored after a reload. Use a browser wallet for a directory that you need to keep managing.

## Workflow

1. Open the public directory to inspect the active route and decision history. Clients should use <code>route()</code> at the latest finalized state as their source of truth. Run <code>npm run resolve -- CONTRACT_ADDRESS</code> to print its service URL and revision as JSON.
2. Connect a browser wallet or create a temporary test wallet. For a persistent directory, use a wallet you control and back up securely.
3. Deploy a named directory. The wallet that deploys it becomes the maintainer.
4. Enter a candidate hostname and check the signer, action and network before confirming. Follow the transaction to finality. A finalized execution can still record a blocked business decision.
5. Read the active hostname and revision. Copy the service URL or contract address. Share the directory by copying the browser URL after opening it.

## Verification and contract state

The owner submits a lowercase hostname with an expected revision. The contract queries Google Public DNS and Cloudflare DNS over HTTPS for the candidate's A record. Each validator independently derives the normalized verdict for both resolvers; <code>gl.eq_principle.strict_eq</code> requires agreement on that verdict pair. This avoids comparing resolver-specific TTLs, record ordering and address rotation.

The contract updates the active hostname and increments its revision only when both observations report an authenticated direct A record. DNS failures, missing direct addresses and unusable responses are recorded as blocked decisions when validators agree. Inconsistent validator observations cannot advance state. The history records the signer, previous route, candidate, decision, resolver verdicts, revision and chain execution time.

| Call | Purpose |
| --- | --- |
| <code>route()</code> | Read the directory title, owner, active hostname, revision and attempt count. |
| <code>history(before)</code> | Read up to twelve finalized attempts, newest first. Use zero for the newest page. |
| <code>switch(candidate, expected_revision)</code> | Verify and conditionally switch. Maintainer only. |

The checks cover DNSSEC as reported by the configured recursive resolvers at transaction time. They do not establish service uptime, TLS certificate validity, business ownership, or that two hostnames provide equivalent services. ZoneSwitch publishes a directory pointer. It does not change upstream DNS records or proxy network traffic. Operators can request another switch if an endpoint changes. Clients should apply their own endpoint policy when consuming directory data.

[Google DoH JSON fields](https://developers.google.com/speed/public-dns/docs/doh/json) · [Cloudflare DoH JSON format](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)

## Development

Node.js 24, Vue 3, Vite, GenLayerJS 2.0.0. The site targets Stable Studionet, chain 61999. It quotes the current execution-fee floor and sends signed transactions with the fee distribution required by the network.

    npm ci
    npm run dev
    npm test
    npm run build
    python -m unittest discover -s tests
    npm run verify

<code>npm run verify</code> is read-only. To reproduce the signed acceptance flow on a fresh directory, run <code>STUDIONET_FAUCET=1 npm run test:studionet</code>. It uses separate maintainer and unauthorized test wallets, and live DNS data. The chain is a test network and resolver conditions may change.
