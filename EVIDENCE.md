# Stable Studionet evidence

- Chain ID 61999 · [Contract](https://explorer-studio.genlayer.com/address/0xB4b17deCAF3df51510Aa190eCf7E28Bb269aD82D)
- Exact contract address — `0xB4b17deCAF3df51510Aa190eCf7E28Bb269aD82D`
- Deployed source SHA-256 — `c048407d921fde3fde729830c26f60dd14a840f70e7906d7665db9fef87aedd2`

| Scenario | Transaction | Finality | Execution | Business result |
| --- | --- | --- | --- | --- |
| Deploy directory | [`0x09ab00f698…f4e1be`](https://explorer-studio.genlayer.com/tx/0x09ab00f69890b06008d3ddebc885c9d1682caa2a73eb3b475c6cb50cd7f4e1be) | FINALIZED | SUCCESS | Directory created |
| Authenticated candidate | [`0xb0fb694268…89ba5e`](https://explorer-studio.genlayer.com/tx/0xb0fb694268515f6b6a245b019bbbb1d3fc78fbaa59ed7fc71f334ab41889ba5e) | FINALIZED | SUCCESS | Both checks authenticated; cloudflare.com active at revision 1 |
| Broken DNSSEC candidate | [`0x1c3caefbd3…ce5498`](https://explorer-studio.genlayer.com/tx/0x1c3caefbd30ca5b6d5c7d700787f1e2811b443463fc664c23802e143bdce5498) | FINALIZED | SUCCESS | Both resolvers returned SERVFAIL; previous route retained |
| Non-owner wallet | [`0x81a4d173a1…903218`](https://explorer-studio.genlayer.com/tx/0x81a4d173a1b01bbf9bc2cf88251e0e093e3f11cacee3ed92460f3fbeac903218) | FINALIZED | ERROR | Permission rejected |
| Stale expected revision | [`0x99d5cb3ec9…e94b8e`](https://explorer-studio.genlayer.com/tx/0x99d5cb3ec92a410ce53c68ae4a6cd5ab842c3b1ae4ddceb12085531f9ae94b8e) | FINALIZED | ERROR | Version guard rejected |
| Duplicate active hostname | [`0xea18472b79…529a6c`](https://explorer-studio.genlayer.com/tx/0xea18472b79ca747f7904a84570d9ebe778a1c38d6b5b2ce88e53f6727a529a6c) | FINALIZED | ERROR | Duplicate rejected |

The blocked switch is a successful execution that records a refusal without changing the route. Finalized readback shows two attempts, active hostname `cloudflare.com` and revision `1`. The three rejected calls did not add history or change the active state.

Use `npm run verify` to check the deployed source, receipts, agreed resolver outputs and final state. [Machine-readable evidence](EVIDENCE.json).
