import { feeOptions } from '../src/fees.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';

assert.equal(studionet.id, 61999);
assert.equal(studionet.rpcUrls.default.http[0].replace(/\/$/, ''), 'https://studio.genlayer.com/api');

export const reader = createClient({ chain: studionet });

export async function signer(key) {
  if (!key && process.env.STUDIONET_FAUCET !== '1') throw new Error('Set STUDIONET_FAUCET=1 for disposable test wallets.');
  const account = createAccount(key);
  const client = createClient({ chain: studionet, account });
  if (!key) await client.request({ method: 'sim_fundAccount', params: [account.address, 10 ** 18] });
  return client;
}

function stateOf(receipt) {
  return receipt?.status_name || receipt?.statusName || (receipt?.status === 7 ? 'FINALIZED' : receipt?.status);
}

export async function verify(hash, expectedError) {
  let receipt;
  let lastError;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      receipt = await reader.getTransaction({ hash });
      if (stateOf(receipt) === 'FINALIZED') break;
      if (stateOf(receipt) === 'CANCELED') throw new Error('Transaction canceled');
    } catch (error) {
      if (error.message === 'Transaction canceled') throw error;
      lastError = error;
    }
    await delay(3000);
  }
  const state = stateOf(receipt);
  assert.equal(state, 'FINALIZED', lastError?.message || 'Timed out waiting for finality');
  const leader = receipt.consensus_data?.leader_receipt?.find((row) => row.mode === 'leader');
  assert.ok(leader, 'Missing executor receipt');
  const outcome = leader.result?.payload;
  if (expectedError) {
    assert.equal(leader.execution_result, 'ERROR');
    if (expectedError instanceof RegExp) assert.match(String(outcome), expectedError);
    else assert.equal(outcome, expectedError);
  } else {
    assert.equal(leader.execution_result, 'SUCCESS', JSON.stringify(leader));
  }
  return {
    hash, state, execution: leader.execution_result, from: receipt.from_address ?? receipt.sender,
    consensus: receipt.result_name || receipt.resultName,
    votes: receipt.consensus_data?.votes,
    ...(expectedError ? { error: outcome } : {}),
  };
}

export async function makeDeployment(client, source, args, name) {
  const code = await readFile(source, 'utf8');
  const hash = await client.deployContract({ code, args, leaderOnly: false, fees: await feeOptions(client) });
  console.error(name, 'deploy', hash);
  const evidence = await verify(hash);
  const receipt = await reader.getTransaction({ hash });
  const address = receipt.data?.contract_address ?? receipt.to_address ?? receipt.recipient;
  assert.match(address, /^0x[0-9a-f]{40}$/i);
  return { address, evidence };
}

export async function submit(client, address, name, args = [], label = name, expectedError) {
  const hash = await client.writeContract({ address, functionName: name, args, leaderOnly: false, value: 0n, fees: await feeOptions(client) });
  console.error(label, hash);
  return verify(hash, expectedError);
}

export async function read(address, functionName, args = []) {
  const raw = await reader.readContract({ address, functionName, args, transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  return raw ? JSON.parse(raw) : null;
}
