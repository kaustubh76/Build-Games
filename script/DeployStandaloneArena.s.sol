// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Arena} from "../src/Arena.sol";
import {IWarriorsNFT} from "../src/Interfaces/IWarriorsNFT.sol";

contract DeployStandaloneArena is Script {
    function run() external {
        address crownToken = 0xF0011ca65e3F6314B180a8848ae373042bAEc9b4;
        address aiPublicKey = 0xFc46DA4cbAbDca9f903863De571E03A39D9079aD;
        address warriorsNFT = 0x6135D8ad56A326Ab0D6D12E5871cCD0b2b80da08;

        vm.startBroadcast();

        Arena arena = new Arena(
            10000000000000000,
            10000000000000000,
            crownToken,
            aiPublicKey,
            warriorsNFT,
            10000000000000000,
            IWarriorsNFT.Ranking.UNRANKED
        );
        console.log("Arena deployed at:", address(arena));

        vm.stopBroadcast();
    }
}
