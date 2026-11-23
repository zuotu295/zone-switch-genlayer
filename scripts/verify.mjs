import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { abi } from 'genlayer-js';
import { reader, read, verify } from './studionet.mjs';

const file = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const data = JSON.parse(await file('../EVIDENCE.json'));
assert.equal(Number(await reader.request({ method: 'eth_chainId' })), 61999);
assert.equal(await reader.getContractCode(data.address), await file('../contracts/zone_switch.py'));
const cases = ['deployment', 'first', 'abnormal', 'unauthorized', 'stale', 'duplicate'];
await Promise.all(cases.map(async (key) => {
  const evidence = data[key];
  const observed = await verify(evidence.hash, evidence.error);
  assert.equal(observed.execution, evidence.execution, key);
  const tx = await reader.getTransaction({ hash: evidence.hash });
  assert.equal(tx.data?.contract_address ?? tx.to_address, data.address, key);
  if (key === 'first' || key === 'abnormal') {
    const row = data.history.find((item) => item.id === (key === 'first' ? 1 : 2));
    const leader = tx.consensus_data.leader_receipt.find((item) => item.mode === 'leader');
    const outputs = Object.values(leader.eq_outputs);
    assert.equal(outputs.length, 1);
    const encoded = Buffer.from(typeof outputs[0] === 'string' ? outputs[0] : outputs[0].raw, 'base64');
    assert.equal(encoded[0], 0);
    assert.deepEqual(JSON.parse(abi.calldata.decode(encoded.subarray(1))), row.checks);
    assert.equal(observed.from, row.actor);
  }
}));
assert.deepEqual(await read(data.address, 'route'), data.final);
assert.deepEqual(await read(data.address, 'history', [0]), data.history);
console.log('Verified identity, deployed source, finalized receipts, equivalence outputs and route state.');
