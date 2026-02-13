// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PredictionMarketAMM} from "../src/PredictionMarketAMM.sol";
import {ExternalMarketMirror} from "../src/ExternalMarketMirror.sol";
import {PredictionArena} from "../src/PredictionArena.sol";

/**
 * @title RedeployAMMArena
 * @notice Redeploy PredictionMarketAMM (MIN_LIQUIDITY=0.01), ExternalMarketMirror (needs new AMM),
 *         and PredictionArena (MIN_STAKES=0.01)
 *
 * Run:
 * DEPLOYER_PRIVATE_KEY=0x... \
 * AI_SIGNER_ADDRESS=0x... \
 * CROWN_TOKEN=0x... \
 * OUTCOME_TOKEN=0x... \
 * WARRIORS_NFT=0x... \
 * forge script script/RedeployAMMArena.s.sol:RedeployAMMArena \
 *   --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
 *   --broadcast -vvvv
 */
contract RedeployAMMArena is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address aiPublicKey = vm.envAddress("AI_SIGNER_ADDRESS");
        address crownToken = vm.envAddress("CROWN_TOKEN");
        address outcomeToken = vm.envAddress("OUTCOME_TOKEN");
        address warriorsNFT = vm.envAddress("WARRIORS_NFT");

        console2.log("=== Redeploy AMM + Mirror + Arena ===");
        console2.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. PredictionMarketAMM with MIN_LIQUIDITY = 0.01 CRwN
        //    Constructor: (crownToken, outcomeToken, oracle=deployer)
        PredictionMarketAMM predictionMarketAMM = new PredictionMarketAMM(
            crownToken,
            outcomeToken,
            deployer // oracle = deployer for testnet
        );
        console2.log("PredictionMarketAMM:", address(predictionMarketAMM));

        // 2. ExternalMarketMirror with new AMM address (immutable)
        ExternalMarketMirror externalMarketMirror = new ExternalMarketMirror(
            crownToken,
            address(predictionMarketAMM),
            address(0) // oracle set later
        );
        console2.log("ExternalMarketMirror:", address(externalMarketMirror));

        // 3. PredictionArena with MIN_STAKES = 0.01 CRwN
        PredictionArena predictionArena = new PredictionArena(
            crownToken,
            warriorsNFT,
            aiPublicKey
        );
        console2.log("PredictionArena:", address(predictionArena));

        vm.stopBroadcast();

        console2.log("=== Redeploy Complete ===");
        console2.log("");
        console2.log("POST-DEPLOY: Update cross-contract references:");
        console2.log("  OutcomeToken.setMarketContract(newAMM)");
        console2.log("  AIDebateOracle.setPredictionMarket(newAMM)");
        console2.log("  MicroMarketFactory.setMainPredictionMarket(newAMM)");
        console2.log("  MarketFactory.setPredictionMarket(newAMM)");
    }
}
