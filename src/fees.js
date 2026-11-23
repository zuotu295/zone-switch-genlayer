export async function feeOptions(client) {
  // Studionet models execution fees in wei. Fund the live floor plus headroom.
  const { policy } = await client.request({ method: 'sim_getFeeConfig', params: [] });
  const floor = BigInt(policy.genvmStartBudgetFloor);
  const estimate = await client.estimateTransactionFees({
    leaderTimeunitsAllocation: 125n, validatorTimeunitsAllocation: 250n,
    executionBudgetPerRound: floor * 8n, rotations: [0n],
  });
  return { distribution: estimate.distribution, feeValue: estimate.feeValue };
}
