// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {WarriorsNFT} from "../src/WarriorsNFT.sol";
import {ArenaFactory} from "../src/ArenaFactory.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {AIAgentRegistry} from "../src/AIAgentRegistry.sol";
import {CreatorRevenueShare} from "../src/CreatorRevenueShare.sol";
import {PredictionMarketAMM} from "../src/PredictionMarketAMM.sol";
import {AIDebateOracle} from "../src/AIDebateOracle.sol";
import {MicroMarketFactory} from "../src/MicroMarketFactory.sol";
import {ExternalMarketMirror} from "../src/ExternalMarketMirror.sol";
import {AIAgentINFT} from "../src/AIAgentINFT.sol";
import {AILiquidityManager} from "../src/AILiquidityManager.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {PredictionArena} from "../src/PredictionArena.sol";

/**
 * @title DeployAvalancheSimplified
 * @notice Simplified deployment script for Avalanche (NO VRF needed!)
 * @dev Deploys all Warriors AI Arena contracts to Avalanche Fuji Testnet or C-Chain Mainnet
 *
 * Key Features:
 * - Uses block-based randomness (no external VRF dependency)
 * - Full prediction market + AI agent arena functionality
 * - Compatible with Avalanche Fuji Testnet (43113) and C-Chain Mainnet (43114)
 */
contract DeployAvalancheSimplified is Script {
    // ============ Avalanche Configuration ============

    // Avalanche Fuji Testnet (43113) or C-Chain Mainnet (43114)
    uint256 constant CHAIN_ID_FUJI = 43113;
    uint256 constant CHAIN_ID_MAINNET = 43114;

    // ============ Game Economics ============

    uint256 constant COST_TO_INFLUENCE = 10 ether;  // 10 CRWN
    uint256 constant COST_TO_DEFLUENCE = 5 ether;   // 5 CRWN
    uint256 constant BET_AMOUNT = 1 ether;          // 1 CRWN

    // ============ Deployment State ============

    struct DeployedContracts {
        address crownToken;
        address warriorsNFT;
        address arenaFactory;
        address mockOracle;
        address outcomeToken;
        address aiAgentRegistry;
        address creatorRevenueShare;
        address predictionMarketAMM;
        address oracle; // Simple oracle address (deployer or mock)
        address aiDebateOracle;
        address microMarketFactory;
        address externalMarketMirror;
        address aiAgentINFT;
        address aiLiquidityManager;
        address marketFactory;
        address predictionArena;
    }

    function run() external {
        // Read environment variables
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address aiPublicKey = vm.envAddress("AI_SIGNER_ADDRESS");

        // Optional oracle address (can be set later)
        address oracleAddress = vm.envOr("ORACLE_ADDRESS", address(0));

        console2.log("==========================================================");
        console2.log("   Warriors AI Arena - Avalanche Deployment (Simplified)");
        console2.log("==========================================================");
        console2.log("Chain ID:", block.chainid);
        console2.log("Deployer:", deployer);
        console2.log("AI Signer:", aiPublicKey);
        console2.log("Oracle Address:", oracleAddress);
        console2.log("==========================================================\n");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy contracts
        DeployedContracts memory contracts = _deployContracts(deployer, aiPublicKey, oracleAddress);

        // Setup permissions and links
        _setupContracts(contracts);

        vm.stopBroadcast();

        // Print deployment summary
        _printSummary(contracts);

        // Save deployment to JSON
        _saveDeployment(contracts);
    }

    /**
     * @notice Deploy all contracts in correct order
     */
    function _deployContracts(address deployer, address aiPublicKey, address oracleAddress)
        private
        returns (DeployedContracts memory contracts)
    {
        console2.log("Step 1: Deploying Core Tokens...");

        // 1. Deploy CrownToken (ERC20)
        CrownToken crownToken = new CrownToken();
        contracts.crownToken = address(crownToken);
        console2.log("  OK CrownToken:", contracts.crownToken);

        // 2. Deploy OutcomeToken (ERC1155)
        OutcomeToken outcomeToken = new OutcomeToken();
        contracts.outcomeToken = address(outcomeToken);
        console2.log("  OK OutcomeToken:", contracts.outcomeToken);

        console2.log("\nStep 2: Deploying Mock Oracle for Testing...");

        // 3. Deploy MockOracle (for testing)
        MockOracle mockOracle = new MockOracle();
        contracts.mockOracle = address(mockOracle);
        console2.log("  OK MockOracle:", contracts.mockOracle);

        console2.log("\nStep 3: Deploying Warriors NFT...");

        // 4. Deploy Warriors NFT
        WarriorsNFT warriorsNFT = new WarriorsNFT(
            deployer,  // DAO address
            aiPublicKey,
            contracts.mockOracle  // Use mock oracle for now
        );
        contracts.warriorsNFT = address(warriorsNFT);
        console2.log("  OK WarriorsNFT:", contracts.warriorsNFT);

        console2.log("\nStep 4: Deploying Arena Factory (NO VRF!)...");

        // 5. Deploy Arena Factory (NO cadenceArch parameter!)
        ArenaFactory arenaFactory = new ArenaFactory(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            contracts.crownToken,
            aiPublicKey,
            // NO cadenceArch parameter - removed for Avalanche!
            contracts.warriorsNFT,
            BET_AMOUNT
        );
        contracts.arenaFactory = address(arenaFactory);
        console2.log("  OK ArenaFactory:", contracts.arenaFactory);
        console2.log("    -> 5 Arenas created (UNRANKED, BRONZE, SILVER, GOLD, PLATINUM)");

        console2.log("\nStep 5: Deploying Prediction Market Infrastructure...");

        // 6. Deploy AI Agent Registry
        AIAgentRegistry aiAgentRegistry = new AIAgentRegistry(contracts.crownToken);
        contracts.aiAgentRegistry = address(aiAgentRegistry);
        console2.log("  OK AIAgentRegistry:", contracts.aiAgentRegistry);

        // 7. Deploy Creator Revenue Share
        CreatorRevenueShare creatorRevenueShare = new CreatorRevenueShare(
            contracts.crownToken
        );
        contracts.creatorRevenueShare = address(creatorRevenueShare);
        console2.log("  OK CreatorRevenueShare:", contracts.creatorRevenueShare);

        // 8. Deploy Prediction Market AMM
        PredictionMarketAMM predictionMarket = new PredictionMarketAMM(
            contracts.crownToken,
            contracts.outcomeToken,
            contracts.creatorRevenueShare
        );
        contracts.predictionMarketAMM = address(predictionMarket);
        console2.log("  OK PredictionMarketAMM:", contracts.predictionMarketAMM);

        console2.log("\nStep 6: Deploying Oracle System...");

        // 9. Deploy AI Debate Oracle
        AIDebateOracle aiDebateOracle = new AIDebateOracle(
            contracts.crownToken
        );
        contracts.aiDebateOracle = address(aiDebateOracle);
        console2.log("  OK AIDebateOracle:", contracts.aiDebateOracle);

        // 10. Use deployer as oracle (simple setup for Avalanche)
        // In production, this can be a dedicated oracle address
        contracts.oracle = oracleAddress != address(0) ? oracleAddress : deployer;
        console2.log("  OK Oracle Address:", contracts.oracle);

        // 11. Deploy Micro Market Factory
        MicroMarketFactory microMarketFactory = new MicroMarketFactory(
            contracts.crownToken,
            contracts.arenaFactory
        );
        contracts.microMarketFactory = address(microMarketFactory);
        console2.log("  OK MicroMarketFactory:", contracts.microMarketFactory);

        console2.log("\nStep 7: Deploying External Market Mirror (NO VRF!)...");

        // 12. Deploy External Market Mirror (NO flowVRF parameter!)
        ExternalMarketMirror externalMarketMirror = new ExternalMarketMirror(
            contracts.crownToken,
            contracts.predictionMarketAMM,
            // NO flowVRF parameter - removed for Avalanche!
            oracleAddress  // 0G oracle address (can be address(0) initially)
        );
        contracts.externalMarketMirror = address(externalMarketMirror);
        console2.log("  OK ExternalMarketMirror:", contracts.externalMarketMirror);

        console2.log("\nStep 8: Deploying AI Agent iNFT...");

        // 13. Deploy AI Agent iNFT (ERC7857)
        AIAgentINFT aiAgentINFT = new AIAgentINFT(
            contracts.crownToken,
            contracts.mockOracle
        );
        contracts.aiAgentINFT = address(aiAgentINFT);
        console2.log("  OK AIAgentINFT:", contracts.aiAgentINFT);

        console2.log("\nStep 9: Deploying AI Liquidity Manager...");

        // 14. Deploy AI Liquidity Manager
        AILiquidityManager aiLiquidityManager = new AILiquidityManager(
            contracts.crownToken
        );
        contracts.aiLiquidityManager = address(aiLiquidityManager);
        console2.log("  OK AILiquidityManager:", contracts.aiLiquidityManager);

        console2.log("\nStep 10: Deploying Market Factory...");

        // 15. Deploy Market Factory
        MarketFactory marketFactory = new MarketFactory(
            contracts.predictionMarketAMM,
            contracts.arenaFactory,
            contracts.crownToken
        );
        contracts.marketFactory = address(marketFactory);
        console2.log("  OK MarketFactory:", contracts.marketFactory);

        console2.log("\nStep 11: Deploying Prediction Arena...");

        // 16. Deploy Prediction Arena
        PredictionArena predictionArena = new PredictionArena(
            contracts.crownToken,
            contracts.warriorsNFT,
            aiPublicKey
        );
        contracts.predictionArena = address(predictionArena);
        console2.log("  OK PredictionArena:", contracts.predictionArena);

        return contracts;
    }

    /**
     * @notice Setup permissions and contract links
     */
    function _setupContracts(DeployedContracts memory contracts) private {
        console2.log("\nStep 8: Setting up Permissions & Links...");

        // Set prediction market for OutcomeToken
        OutcomeToken(contracts.outcomeToken).setMarketContract(contracts.predictionMarketAMM);
        console2.log("  OK OutcomeToken: setMarketContract()");

        // Set prediction market for AIDebateOracle
        AIDebateOracle(contracts.aiDebateOracle).setPredictionMarket(contracts.predictionMarketAMM);
        console2.log("  OK AIDebateOracle: setPredictionMarket()");

        // Set oracle for PredictionMarketAMM
        PredictionMarketAMM(contracts.predictionMarketAMM).setOracle(contracts.oracle);
        console2.log("  OK PredictionMarketAMM: setOracle()");

        // Set prediction market for AILiquidityManager
        AILiquidityManager(contracts.aiLiquidityManager).setPredictionMarket(contracts.predictionMarketAMM);
        console2.log("  OK AILiquidityManager: setPredictionMarket()");

        // Set AI Debate Oracle for AILiquidityManager
        AILiquidityManager(contracts.aiLiquidityManager).setAIDebateOracle(contracts.aiDebateOracle);
        console2.log("  OK AILiquidityManager: setAIDebateOracle()");

        console2.log("  OK All permissions configured!");
    }

    /**
     * @notice Print deployment summary
     */
    function _printSummary(DeployedContracts memory contracts) private view {
        console2.log("\n==========================================================");
        console2.log("   Deployment Complete!");
        console2.log("==========================================================");
        console2.log("\n[DEPLOYMENT] Deployed Contract Addresses:\n");
        console2.log("Core Tokens:");
        console2.log("  CrownToken:              ", contracts.crownToken);
        console2.log("  OutcomeToken:            ", contracts.outcomeToken);
        console2.log("\nGame Contracts:");
        console2.log("  WarriorsNFT:             ", contracts.warriorsNFT);
        console2.log("  ArenaFactory:            ", contracts.arenaFactory);
        console2.log("  MockOracle:              ", contracts.mockOracle);
        console2.log("\nPrediction Markets:");
        console2.log("  PredictionMarketAMM:     ", contracts.predictionMarketAMM);
        console2.log("  MicroMarketFactory:      ", contracts.microMarketFactory);
        console2.log("  ExternalMarketMirror:    ", contracts.externalMarketMirror);
        console2.log("\nOracles & AI:");
        console2.log("  Oracle:                  ", contracts.oracle);
        console2.log("  AIDebateOracle:          ", contracts.aiDebateOracle);
        console2.log("  AIAgentRegistry:         ", contracts.aiAgentRegistry);
        console2.log("\nRevenue:");
        console2.log("  CreatorRevenueShare:     ", contracts.creatorRevenueShare);
        console2.log("\nAdditional Contracts:");
        console2.log("  AIAgentINFT:             ", contracts.aiAgentINFT);
        console2.log("  AILiquidityManager:      ", contracts.aiLiquidityManager);
        console2.log("  MarketFactory:           ", contracts.marketFactory);
        console2.log("  PredictionArena:         ", contracts.predictionArena);
        console2.log("\n==========================================================");
        console2.log("[SUCCESS] All contracts deployed and configured successfully!");
        console2.log("==========================================================\n");
    }

    /**
     * @notice Save deployment to JSON file
     */
    function _saveDeployment(DeployedContracts memory contracts) private {
        string memory chainName = block.chainid == CHAIN_ID_FUJI ? "Avalanche Fuji Testnet" : "Avalanche C-Chain Mainnet";

        string memory jsonPart1 = string(abi.encodePacked(
            '{\n',
            '  "network": "', chainName, '",\n',
            '  "chainId": ', vm.toString(block.chainid), ',\n',
            '  "timestamp": ', vm.toString(block.timestamp), ',\n',
            '  "contracts": {\n',
            '    "crownToken": "', vm.toString(contracts.crownToken), '",\n',
            '    "warriorsNFT": "', vm.toString(contracts.warriorsNFT), '",\n',
            '    "arenaFactory": "', vm.toString(contracts.arenaFactory), '",\n',
            '    "mockOracle": "', vm.toString(contracts.mockOracle), '",\n',
            '    "outcomeToken": "', vm.toString(contracts.outcomeToken), '",\n',
            '    "aiAgentRegistry": "', vm.toString(contracts.aiAgentRegistry), '",\n'
        ));

        string memory jsonPart2 = string(abi.encodePacked(
            '    "creatorRevenueShare": "', vm.toString(contracts.creatorRevenueShare), '",\n',
            '    "predictionMarketAMM": "', vm.toString(contracts.predictionMarketAMM), '",\n',
            '    "oracle": "', vm.toString(contracts.oracle), '",\n',
            '    "aiDebateOracle": "', vm.toString(contracts.aiDebateOracle), '",\n',
            '    "microMarketFactory": "', vm.toString(contracts.microMarketFactory), '",\n',
            '    "externalMarketMirror": "', vm.toString(contracts.externalMarketMirror), '",\n',
            '    "aiAgentINFT": "', vm.toString(contracts.aiAgentINFT), '",\n',
            '    "aiLiquidityManager": "', vm.toString(contracts.aiLiquidityManager), '",\n',
            '    "marketFactory": "', vm.toString(contracts.marketFactory), '",\n',
            '    "predictionArena": "', vm.toString(contracts.predictionArena), '"\n',
            '  }\n',
            '}'
        ));

        string memory json = string.concat(jsonPart1, jsonPart2);

        string memory filename = string(abi.encodePacked(
            "deployments/avalanche-",
            block.chainid == CHAIN_ID_FUJI ? "testnet" : "mainnet",
            ".json"
        ));

        vm.writeFile(filename, json);
        console2.log("[SAVED] Deployment saved to:", filename);
    }
}
