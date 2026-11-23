# ZoneSwitch

ZoneSwitch is an on-chain service route directory. Directory maintainers select an entry hostname and clients read its active revision from GenLayer. Publishing a candidate requires two public DNS resolvers to report a DNSSEC-authenticated direct IPv4 record. A blocked candidate leaves the published route intact.

- [Open ZoneSwitch](https://zuotu295.github.io/zone-switch-genlayer/)
- [Stable Studionet acceptance evidence](EVIDENCE.md)

## Workflow

1. Open the public directory to inspect the active route and the decision history. Clients should use `route()` at the latest finalized state as their source of truth. Run `npm run resolve -- CONTRACT_ADDRESS` to print its service URL and revision as JSON.
2. To try a switch, create a session-only test wallet and deploy a named directory. The wallet that deploys it is the maintainer.
3. Enter a candidate hostname and check the signer, action and network before confirming. Follow the transaction to finality. A finalized execution can still record a blocked business decision.
4. Read the active hostname and revision. Copy the service URL or contract address. Share the directory by copying the browser URL after opening it.

The browser generates the test key locally, holds it in memory, and uses the Stable Studionet faucet. Disconnecting or leaving the page discards the key. Only public transaction details are cached. This sample does not offer owner recovery or rotation. Use your own securely managed Studionet account via the SDK for a directory you need to keep editing.

## Verification and contract state

The owner submits a lowercase hostname with an expected revision. The contract queries Google Public DNS and Cloudflare DNS over HTTPS for the candidate's A record. Each validator independently derives the normalized verdict for both resolvers; `gl.eq_principle.strict_eq` requires agreement on that verdict pair. This avoids comparing resolver-specific TTLs, record ordering and address rotation.

The contract updates the active hostname and increments its revision only when both observations report an authenticated direct A record. DNS failures, missing direct addresses and unusable responses are recorded as blocked decisions when validators agree. Inconsistent validator observations cannot advance state. The history records the signer, previous route, candidate, decision, resolver verdicts, revision and chain execution time.

| Call | Purpose |
| --- | --- |
| `route()` | Read the directory title, owner, active hostname, revision and attempt count. |
| `history(before)` | Read up to twelve finalized attempts, newest first. Use zero for the newest page. |
| `switch(candidate, expected_revision)` | Verify and conditionally switch. Maintainer only. |

The checks cover DNSSEC as reported by the configured recursive resolvers at transaction time. They do not establish service uptime, TLS certificate validity, business ownership, or that two hostnames provide equivalent services. ZoneSwitch publishes a directory pointer. It does not change upstream DNS records or proxy network traffic. Operators can request another switch if an endpoint changes. Clients should apply their own endpoint policy when consuming directory data.

[Google DoH JSON fields](https://developers.google.com/speed/public-dns/docs/doh/json) · [Cloudflare DoH JSON format](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)

## Development

Node.js 24, Vue 3, Vite, GenLayerJS 2.0.0. The site targets Stable Studionet, chain 61999. It quotes the current execution-fee floor and sends signed transactions with the fee distribution required by the network.

```sh
npm ci
npm run dev
npm run build
python -m unittest discover -s tests
npm run verify
```

`npm run verify` is read-only. To reproduce the signed acceptance flow on a fresh directory, run `STUDIONET_FAUCET=1 npm run test:studionet`. It uses separate maintainer and unauthorized test wallets, and live DNS data. The chain is a test network and resolver conditions may change.
