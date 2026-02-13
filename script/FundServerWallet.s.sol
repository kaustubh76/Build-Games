// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ICrownToken} from "../src/Interfaces/ICrownToken.sol";

/**
 * @title FundServerWallet
 * @notice Script to fund the server wallet with CRwN tokens for agent trading
 * @dev Uses the bonding curve mint (1 AVAX = 1 CRwN)
 *
 * Prerequisites:
 * 1. Server wallet must have AVAX from Avalanche Fuji faucet: https://faucet.avax.network/
 * 2. Enter address: 0x5a6472782a098230e04A891a78BeEE1b7d48E90c
 *
 * Run command:
 * DEPLOYER_PRIVATE_KEY=0x... \
 * forge script script/FundServerWallet.s.sol:FundServerWallet \
 * --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
 * --broadcast -vvvv
 */
contract FundServerWallet is Script {
    // CRwN Token on Avalanche Fuji Testnet (Chain 43113)
    // TODO: Update after deploying to Avalanche
    address constant CROWN_TOKEN = address(0); // Set after deployment

    function run() external {
        // Amount to mint (1 AVAX = 1 CRwN via bonding curve)
        uint256 mintAmount = 100 ether; // 100 CRwN

        // Get deployer info
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("=== Fund Server Wallet ===");
        console2.log("Wallet:", deployer);

        // Check current balances
        ICrownToken crown = ICrownToken(CROWN_TOKEN);
        uint256 avaxBalance = deployer.balance;
        uint256 crwnBalance = crown.balanceOf(deployer);

        console2.log("");
        console2.log("Current Balances:");
        console2.log("  AVAX:", avaxBalance / 1e18, "AVAX");
        console2.log("  CRwN:", crwnBalance / 1e18, "CRwN");

        // Check if we have enough AVAX
        if (avaxBalance < mintAmount) {
            console2.log("");
            console2.log("ERROR: Insufficient AVAX balance!");
            console2.log("  Need:", mintAmount / 1e18, "AVAX");
            console2.log("  Have:", avaxBalance / 1e18, "AVAX");
            console2.log("");
            console2.log("Get AVAX from faucet: https://faucet.avax.network/");
            console2.log("Enter address:", deployer);
            return;
        }

        // Start broadcast
        vm.startBroadcast(deployerPrivateKey);

        // Mint CRwN by sending AVAX (1:1 bonding curve)
        console2.log("");
        console2.log("Minting", mintAmount / 1e18, "CRwN...");
        crown.mint{value: mintAmount}(mintAmount);

        vm.stopBroadcast();

        // Show new balance
        uint256 newCrwnBalance = crown.balanceOf(deployer);
        uint256 newAvaxBalance = deployer.balance;

        console2.log("");
        console2.log("=== SUCCESS ===");
        console2.log("New Balances:");
        console2.log("  AVAX:", newAvaxBalance / 1e18, "AVAX");
        console2.log("  CRwN:", newCrwnBalance / 1e18, "CRwN");
        console2.log("");
        console2.log("Server wallet is now funded for agent trading!");
    }
}
