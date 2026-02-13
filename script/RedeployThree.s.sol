// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AIAgentRegistry} from "../src/AIAgentRegistry.sol";
import {ExternalMarketMirror} from "../src/ExternalMarketMirror.sol";
import {PredictionArena} from "../src/PredictionArena.sol";

/**
 * @title RedeployThree
 * @notice Redeploy AIAgentRegistry (lower stakes), ExternalMarketMirror (lower liquidity),
 *         and PredictionArena (correct AI signer)
 *
 * Run:
 * DEPLOYER_PRIVATE_KEY=0x... \
 * AI_SIGNER_ADDRESS=0x... \
 * CROWN_TOKEN=0x... \
 * PREDICTION_MARKET=0x... \
 * WARRIORS_NFT=0x... \
 * forge script script/RedeployThree.s.sol:RedeployThree \
 *   --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
 *   --broadcast -vvvv
 */
contract RedeployThree is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address aiPublicKey = vm.envAddress("AI_SIGNER_ADDRESS");
        address crownToken = vm.envAddress("CROWN_TOKEN");
        address predictionMarket = vm.envAddress("PREDICTION_MARKET");
        address warriorsNFT = vm.envAddress("WARRIORS_NFT");

        console2.log("=== Redeploy 3 Contracts ===");
        console2.log("AI Signer:", aiPublicKey);

        vm.startBroadcast(deployerPrivateKey);

        // 1. AIAgentRegistry with lowered MIN_STAKE (0.1 CRwN)
        AIAgentRegistry aiAgentRegistry = new AIAgentRegistry(crownToken);
        console2.log("AIAgentRegistry:", address(aiAgentRegistry));

        // 2. ExternalMarketMirror with lowered MIN_LIQUIDITY (0.1 CRwN)
        ExternalMarketMirror externalMarketMirror = new ExternalMarketMirror(
            crownToken,
            predictionMarket,
            address(0) // oracle set later
        );
        console2.log("ExternalMarketMirror:", address(externalMarketMirror));

        // 3. PredictionArena with correct AI signer
        PredictionArena predictionArena = new PredictionArena(
            crownToken,
            warriorsNFT,
            aiPublicKey
        );
        console2.log("PredictionArena:", address(predictionArena));

        vm.stopBroadcast();
        console2.log("=== Redeploy Complete ===");
    }
}
