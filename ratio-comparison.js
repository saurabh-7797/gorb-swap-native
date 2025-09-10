// 🎯 RATIO COMPARISON - See How Different Ratios Affect Swaps

console.log("🎲 LIQUIDITY RATIO IMPACT ANALYSIS");
console.log("=====================================");

// Different pool ratios to test
const poolScenarios = [
    {
        name: "Balanced Pool (1:1)",
        amountX: 1000_000_000, // 1.0 X
        amountY: 1000_000_000, // 1.0 Y
        ratio: "1:1",
        description: "Equal value - best for swaps"
    },
    {
        name: "X Expensive (1:2)",
        amountX: 1000_000_000, // 1.0 X
        amountY: 2000_000_000, // 2.0 Y
        ratio: "1:2",
        description: "Y is 2x more valuable - X→Y swaps get less"
    },
    {
        name: "Y Expensive (2:1)",
        amountX: 2000_000_000, // 2.0 X
        amountY: 1000_000_000, // 1.0 Y
        ratio: "2:1",
        description: "X is 2x more valuable - Y→X swaps get less"
    },
    {
        name: "Extreme Unbalance (1:10)",
        amountX: 1000_000_000, // 1.0 X
        amountY: 10000_000_000, // 10.0 Y
        ratio: "1:10",
        description: "Y is 10x more valuable - X→Y swaps get very little"
    },
    {
        name: "Reverse Extreme (10:1)",
        amountX: 10000_000_000, // 10.0 X
        amountY: 1000_000_000, // 1.0 Y
        ratio: "10:1",
        description: "X is 10x more valuable - Y→X swaps get very little"
    }
];

// Simulate swap outcomes for each scenario
function simulateSwap(pool, swapAmount) {
    const { amountX, amountY } = pool;
    
    // Simple AMM formula: (amountIn * reserveOut) / (reserveIn + amountIn)
    // With 0.3% fee: amountIn * 0.997
    const amountInAfterFee = swapAmount * 0.997;
    const amountOut = (amountInAfterFee * amountY) / (amountX + amountInAfterFee);
    
    return {
        amountIn: swapAmount / 1_000_000_000,
        amountOut: amountOut / 1_000_000_000,
        exchangeRate: amountOut / swapAmount,
        priceImpact: ((amountOut / swapAmount) - 1) * 100
    };
}

console.log("\n🔄 SWAP SIMULATION: 0.5 Token X → Token Y");
console.log("================================================");

poolScenarios.forEach((pool, index) => {
    const result = simulateSwap(pool, 500_000_000); // 0.5 tokens
    
    console.log(`\n${index + 1}. ${pool.name}`);
    console.log(`   Pool: ${pool.amountX / 1_000_000_000} X : ${pool.amountY / 1_000_000_000} Y (${pool.ratio})`);
    console.log(`   Description: ${pool.description}`);
    console.log(`   Swap Result: ${result.amountIn} X → ${result.amountOut.toFixed(6)} Y`);
    console.log(`   Exchange Rate: 1 X = ${result.exchangeRate.toFixed(6)} Y`);
    console.log(`   Price Impact: ${result.priceImpact.toFixed(2)}%`);
});

console.log("\n🎯 MULTIHOP IMPACT (X→Y→Z)");
console.log("=====================================");

// Simulate multihop with different Y-Z ratios
const yzScenarios = [
    { name: "Balanced Y-Z", amountY: 1000_000_000, amountZ: 1000_000_000, ratio: "1:1" },
    { name: "Z Expensive", amountY: 1000_000_000, amountZ: 2000_000_000, ratio: "1:2" },
    { name: "Y Expensive", amountY: 2000_000_000, amountZ: 1000_000_000, ratio: "2:1" }
];

console.log("\nAssuming X→Y gives 0.1 Y (from unbalanced X-Y pool):");

yzScenarios.forEach((pool, index) => {
    const result = simulateSwap(pool, 100_000_000); // 0.1 Y
    
    console.log(`\n${index + 1}. ${pool.name}`);
    console.log(`   Pool: ${pool.amountY / 1_000_000_000} Y : ${pool.amountZ / 1_000_000_000} Z (${pool.ratio})`);
    console.log(`   Multihop Result: 0.5 X → 0.1 Y → ${result.amountOut.toFixed(6)} Z`);
    console.log(`   Total Exchange Rate: 1 X = ${(result.amountOut * 0.1).toFixed(6)} Z`);
});

console.log("\n💡 KEY INSIGHTS:");
console.log("=====================================");
console.log("✅ Balanced pools (1:1) give best swap rates");
console.log("❌ Unbalanced pools give poor swap rates");
console.log("⚠️  Large swaps have more price impact");
console.log("🔄 Multihop amplifies the imbalance effects");
console.log("💰 Fees compound in multihop swaps (0.3% + 0.3% = 0.6%)");

console.log("\n🎲 RECOMMENDED RATIOS FOR TESTING:");
console.log("=====================================");
console.log("• Best Swaps: 1:1 ratio pools");
console.log("• Test Slippage: 1:2 or 2:1 ratios");
console.log("• Test Price Impact: 1:10 or 10:1 ratios");
console.log("• Test Large Swaps: Use balanced pools");
console.log("• Test Small Swaps: Use any ratio");
