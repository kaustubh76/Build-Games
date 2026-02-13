// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";

interface IPredictionMarketAMM {
    enum MarketStatus { ACTIVE, RESOLVED, CANCELLED }
    enum Outcome { YES, NO, INVALID, UNDECIDED }

    struct Market {
        uint256 id;
        string question;
        uint256 endTime;
        uint256 resolutionTime;
        MarketStatus status;
        Outcome outcome;
        uint256 yesTokens;
        uint256 noTokens;
        uint256 liquidity;
        uint256 totalVolume;
        address creator;
        uint256 battleId;
        uint256 warrior1Id;
        uint256 warrior2Id;
        uint256 createdAt;
    }

    function getMarket(uint256 marketId) external view returns (Market memory);
    function getActiveMarkets() external view returns (uint256[] memory);
    function resolveMarket(uint256 marketId, Outcome outcome, bytes calldata oracleProof) external;
    function owner() external view returns (address);
}

/**
 * @title SettleMarkets
 * @notice Script to settle expired prediction markets on Avalanche
 * @dev Only owner can resolve markets. Uses AI_SIGNER_PRIVATE_KEY
 *
 * Run command:
 * DEPLOYER_PRIVATE_KEY=0x... \
 * forge script script/SettleMarkets.s.sol:SettleMarkets \
 * --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
 * --broadcast -vvvv
 *
 * Or to settle specific market with specific outcome:
 * DEPLOYER_PRIVATE_KEY=0x... \
 * MARKET_ID=1 OUTCOME=1 \
 * forge script script/SettleMarkets.s.sol:SettleMarkets \
 * --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
 * --broadcast -vvvv
 */
contract SettleMarkets is Script {
    // PredictionMarketAMM on Avalanche Fuji Testnet (Chain 43113)
    // TODO: Update after deploying to Avalanche
    address constant PREDICTION_MARKET = address(0); // Set after deployment

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("=== Market Settlement Script ===");
        console2.log("Deployer:", deployer);

        IPredictionMarketAMM market = IPredictionMarketAMM(PREDICTION_MARKET);

        // Check ownership
        address owner = market.owner();
        console2.log("Contract owner:", owner);
        require(deployer == owner, "Deployer must be contract owner");

        // Check for specific market to settle
        uint256 specificMarketId = vm.envOr("MARKET_ID", uint256(0));
        uint256 specificOutcome = vm.envOr("OUTCOME", uint256(0)); // 0=UNDECIDED, 1=YES, 2=NO, 3=INVALID

        if (specificMarketId > 0) {
            // Settle specific market
            _settleMarket(market, specificMarketId, IPredictionMarketAMM.Outcome(specificOutcome), deployerPrivateKey);
        } else {
            // Get all active markets and settle expired ones
            uint256[] memory activeMarkets = market.getActiveMarkets();
            console2.log("");
            console2.log("Active markets:", activeMarkets.length);

            for (uint256 i = 0; i < activeMarkets.length; i++) {
                uint256 marketId = activeMarkets[i];
                IPredictionMarketAMM.Market memory m = market.getMarket(marketId);

                console2.log("");
                console2.log("--- Market #", marketId, "---");
                console2.log("Question:", m.question);
                console2.log("End time:", m.endTime);
                console2.log("Current time:", block.timestamp);

                if (block.timestamp >= m.endTime) {
                    console2.log("Status: EXPIRED - needs settlement");

                    // Determine outcome based on market activity
                    // Default to YES if more YES tokens, NO if more NO tokens
                    IPredictionMarketAMM.Outcome outcome;
                    if (m.yesTokens > m.noTokens) {
                        outcome = IPredictionMarketAMM.Outcome.YES;
                        console2.log("Determined outcome: YES (more YES tokens)");
                    } else if (m.noTokens > m.yesTokens) {
                        outcome = IPredictionMarketAMM.Outcome.NO;
                        console2.log("Determined outcome: NO (more NO tokens)");
                    } else {
                        outcome = IPredictionMarketAMM.Outcome.INVALID;
                        console2.log("Determined outcome: INVALID (tied)");
                    }

                    _settleMarket(market, marketId, outcome, deployerPrivateKey);
                } else {
                    console2.log("Status: Still active (not expired)");
                }
            }
        }

        console2.log("");
        console2.log("=== Settlement Complete ===");
    }

    function _settleMarket(
        IPredictionMarketAMM market,
        uint256 marketId,
        IPredictionMarketAMM.Outcome outcome,
        uint256 privateKey
    ) internal {
        console2.log("");
        console2.log("Settling market #", marketId);
        console2.log("Outcome:", uint256(outcome));

        vm.startBroadcast(privateKey);

        // Empty oracle proof for now (owner can resolve without proof)
        bytes memory oracleProof = "";
        market.resolveMarket(marketId, outcome, oracleProof);

        vm.stopBroadcast();

        console2.log("Market #", marketId, "settled successfully!");
    }
}
