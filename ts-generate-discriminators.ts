import { createHash } from "crypto";

// Shank discriminator generation
function generateDiscriminator(instructionName: string): Buffer {
  const hash = createHash("sha256");
  hash.update(`global:${instructionName}`);
  return hash.digest().slice(0, 8);
}

// Test all instruction names
const instructions = [
  "InitPool",
  "AddLiquidity", 
  "RemoveLiquidity",
  "Swap",
  "MultihopSwap",
  "MultihopSwapWithPath",
  "GetPoolInfo",
  "GetTotalPools",
  "FindPoolsByToken",
  "GetSwapQuote",
  "GetMultihopQuote",
  "InitNativeSOLPool",
  "SwapNativeSOLToToken",
  "SwapTokenToNativeSOL",
  "AddLiquidityNativeSOL",
  "RemoveLiquidityNativeSOL",
  "GetNativeSOLPoolInfo",
  "GetNativeSOLSwapQuote"
];

console.log("🔍 Generated Shank discriminators:");
console.log("=" .repeat(60));

instructions.forEach((instruction, index) => {
  const discriminator = generateDiscriminator(instruction);
  console.log(`${index.toString().padStart(2)}: ${instruction.padEnd(25)} -> ${discriminator.toString('hex')}`);
});

// Specifically for InitNativeSOLPool
const initNativeSOLPoolDiscriminator = generateDiscriminator("InitNativeSOLPool");
console.log(`\n🎯 InitNativeSOLPool discriminator: ${initNativeSOLPoolDiscriminator.toString('hex')}`);

// Test with actual data
const testData = Buffer.alloc(8 + 8 + 8);
initNativeSOLPoolDiscriminator.copy(testData, 0);
testData.writeBigUInt64LE(BigInt(1000000000), 8); // amount_sol
testData.writeBigUInt64LE(BigInt(1000000000), 16); // amount_token

console.log(`\n📝 Test instruction data: ${testData.toString('hex')}`);
