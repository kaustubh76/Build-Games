// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PredictionArena} from "../src/PredictionArena.sol";

/**
 * @title RedeployPredictionArena
 * @notice Redeploy PredictionArena with fixed error name (CannotChallengeSelf)
 *
 * Run:
 * forge script script/RedeployPredictionArena.s.sol:RedeployPredictionArena \
 *   --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
 *   --broadcast -vvvv
 */
contract RedeployPredictionArena is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address crownToken = vm.envAddress("CROWN_TOKEN");
        address warriorsNFT = vm.envAddress("WARRIORS_NFT");
        address aiPublicKey = vm.envAddress("AI_SIGNER_ADDRESS");

        console2.log("=== Redeploy PredictionArena ===");
        console2.log("CrownToken:", crownToken);
        console2.log("WarriorsNFT:", warriorsNFT);
        console2.log("AI Signer:", aiPublicKey);

        vm.startBroadcast(deployerPrivateKey);

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
