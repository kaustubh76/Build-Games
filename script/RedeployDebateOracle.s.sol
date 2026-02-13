// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AIDebateOracle} from "../src/AIDebateOracle.sol";

contract RedeployDebateOracle is Script {
    function run() external {
        address crownToken = 0xF0011ca65e3F6314B180a8848ae373042bAEc9b4;

        vm.startBroadcast();

        AIDebateOracle oracle = new AIDebateOracle(crownToken);
        console.log("New AIDebateOracle:", address(oracle));

        vm.stopBroadcast();
    }
}
