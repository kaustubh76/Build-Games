// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ExternalMarketMirror} from "../src/ExternalMarketMirror.sol";
import {AIAgentRegistry} from "../src/AIAgentRegistry.sol";

contract RedeployMirrorRegistry is Script {
    function run() external {
        address crownToken = vm.envAddress("CROWN_TOKEN");
        address predictionMarket = 0xeBe1DB030bBFC5bCdD38593C69e4899887D2e487;
        address oracle = address(0);

        vm.startBroadcast();

        // Deploy new ExternalMarketMirror with ERC1155Holder fix
        ExternalMarketMirror mirror = new ExternalMarketMirror(
            crownToken,
            predictionMarket,
            oracle
        );
        console.log("ExternalMarketMirror:", address(mirror));

        // Deploy new AIAgentRegistry with authorizedCallers fix
        AIAgentRegistry registry = new AIAgentRegistry(crownToken);
        console.log("AIAgentRegistry:", address(registry));

        // Authorize the AMM to call recordCopyTradeFee on the new registry
        registry.authorizeCaller(predictionMarket, true);
        console.log("AMM authorized on registry");

        vm.stopBroadcast();
    }
}
