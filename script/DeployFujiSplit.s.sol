// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {WarriorsNFT} from "../src/WarriorsNFT.sol";
import {ArenaFactoryLight} from "../src/ArenaFactoryLight.sol";
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
import {IWarriorsNFT} from "../src/Interfaces/IWarriorsNFT.sol";

/**
 * @title DeployFujiPhase1
 * @notice Deploy core tokens, oracle, and NFT
 */
contract DeployFujiPhase1 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address aiPublicKey = vm.envAddress("AI_SIGNER_ADDRESS");

        console2.log("=== Phase 1: Core Tokens + Oracle + NFT ===");
        console2.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        CrownToken crownToken = new CrownToken();
        console2.log("CrownToken:", address(crownToken));

        OutcomeToken outcomeToken = new OutcomeToken();
        console2.log("OutcomeToken:", address(outcomeToken));

        MockOracle mockOracle = new MockOracle();
        console2.log("MockOracle:", address(mockOracle));

        WarriorsNFT warriorsNFT = new WarriorsNFT(deployer, aiPublicKey, address(mockOracle));
        console2.log("WarriorsNFT:", address(warriorsNFT));

        vm.stopBroadcast();
        console2.log("=== Phase 1 Complete ===");
    }
}

/**
 * @title DeployFujiPhase2
 * @notice Deploy ArenaFactoryLight (no arenas in constructor) + first 2 arenas
 */
contract DeployFujiPhase2 is Script {
    uint256 constant COST_TO_INFLUENCE = 10 ether;
    uint256 constant COST_TO_DEFLUENCE = 5 ether;
    uint256 constant BET_AMOUNT = 1 ether;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address aiPublicKey = vm.envAddress("AI_SIGNER_ADDRESS");
        address crownToken = vm.envAddress("CROWN_TOKEN");
        address warriorsNFT = vm.envAddress("WARRIORS_NFT");

        console2.log("=== Phase 2: ArenaFactoryLight + First 2 Arenas ===");

        vm.startBroadcast(deployerPrivateKey);

        ArenaFactoryLight arenaFactory = new ArenaFactoryLight(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            crownToken,
            aiPublicKey,
            warriorsNFT,
            BET_AMOUNT
        );
        console2.log("ArenaFactoryLight:", address(arenaFactory));

        arenaFactory.deployArena(IWarriorsNFT.Ranking.UNRANKED, 1);
        console2.log("  Arena UNRANKED deployed");

        arenaFactory.deployArena(IWarriorsNFT.Ranking.BRONZE, 2);
        console2.log("  Arena BRONZE deployed");

        vm.stopBroadcast();
        console2.log("=== Phase 2 Complete ===");
    }
}

/**
 * @title DeployFujiPhase2b
 * @notice Deploy remaining 3 arenas (SILVER, GOLD, PLATINUM)
 */
contract DeployFujiPhase2b is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address arenaFactory = vm.envAddress("ARENA_FACTORY");

        console2.log("=== Phase 2b: Remaining Arenas ===");

        vm.startBroadcast(deployerPrivateKey);

        ArenaFactoryLight(arenaFactory).deployArena(IWarriorsNFT.Ranking.SILVER, 3);
        console2.log("  Arena SILVER deployed");

        ArenaFactoryLight(arenaFactory).deployArena(IWarriorsNFT.Ranking.GOLD, 4);
        console2.log("  Arena GOLD deployed");

        ArenaFactoryLight(arenaFactory).deployArena(IWarriorsNFT.Ranking.PLATINUM, 5);
        console2.log("  Arena PLATINUM deployed");

        vm.stopBroadcast();
        console2.log("=== Phase 2b Complete ===");
    }
}

/**
 * @title DeployFujiPhase3
 * @notice Deploy prediction markets, AI contracts, and external integrations
 */
contract DeployFujiPhase3 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address crownToken = vm.envAddress("CROWN_TOKEN");
        address outcomeToken = vm.envAddress("OUTCOME_TOKEN");
        address mockOracle = vm.envAddress("MOCK_ORACLE");
        address arenaFactory = vm.envAddress("ARENA_FACTORY");

        console2.log("=== Phase 3: Prediction Markets + AI ===");

        vm.startBroadcast(deployerPrivateKey);

        AIAgentRegistry aiAgentRegistry = new AIAgentRegistry(crownToken);
        console2.log("AIAgentRegistry:", address(aiAgentRegistry));

        CreatorRevenueShare creatorRevenueShare = new CreatorRevenueShare(crownToken);
        console2.log("CreatorRevenueShare:", address(creatorRevenueShare));

        PredictionMarketAMM predictionMarket = new PredictionMarketAMM(crownToken, outcomeToken, address(creatorRevenueShare));
        console2.log("PredictionMarketAMM:", address(predictionMarket));

        AIDebateOracle aiDebateOracle = new AIDebateOracle(crownToken);
        console2.log("AIDebateOracle:", address(aiDebateOracle));

        MicroMarketFactory microMarketFactory = new MicroMarketFactory(crownToken, arenaFactory);
        console2.log("MicroMarketFactory:", address(microMarketFactory));

        ExternalMarketMirror externalMarketMirror = new ExternalMarketMirror(crownToken, address(predictionMarket), address(0));
        console2.log("ExternalMarketMirror:", address(externalMarketMirror));

        AIAgentINFT aiAgentINFT = new AIAgentINFT(crownToken, mockOracle);
        console2.log("AIAgentINFT:", address(aiAgentINFT));

        AILiquidityManager aiLiquidityManager = new AILiquidityManager(crownToken);
        console2.log("AILiquidityManager:", address(aiLiquidityManager));

        MarketFactory marketFactory = new MarketFactory(address(predictionMarket), arenaFactory, crownToken);
        console2.log("MarketFactory:", address(marketFactory));

        vm.stopBroadcast();
        console2.log("=== Phase 3 Complete ===");
    }
}

/**
 * @title DeployFujiPhase4
 * @notice Deploy PredictionArena + setup all permissions
 */
contract DeployFujiPhase4 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address aiPublicKey = vm.envAddress("AI_SIGNER_ADDRESS");
        address crownToken = vm.envAddress("CROWN_TOKEN");
        address warriorsNFT = vm.envAddress("WARRIORS_NFT");
        address outcomeToken = vm.envAddress("OUTCOME_TOKEN");
        address predictionMarket = vm.envAddress("PREDICTION_MARKET");
        address aiDebateOracle = vm.envAddress("AI_DEBATE_ORACLE");
        address aiLiquidityManager = vm.envAddress("AI_LIQUIDITY_MANAGER");

        console2.log("=== Phase 4: PredictionArena + Permissions ===");

        vm.startBroadcast(deployerPrivateKey);

        PredictionArena predictionArena = new PredictionArena(crownToken, warriorsNFT, aiPublicKey);
        console2.log("PredictionArena:", address(predictionArena));

        OutcomeToken(outcomeToken).setMarketContract(predictionMarket);
        console2.log("OutcomeToken: setMarketContract OK");

        AIDebateOracle(aiDebateOracle).setPredictionMarket(predictionMarket);
        console2.log("AIDebateOracle: setPredictionMarket OK");

        PredictionMarketAMM(predictionMarket).setOracle(deployer);
        console2.log("PredictionMarketAMM: setOracle OK");

        AILiquidityManager(aiLiquidityManager).setPredictionMarket(predictionMarket);
        console2.log("AILiquidityManager: setPredictionMarket OK");

        AILiquidityManager(aiLiquidityManager).setAIDebateOracle(aiDebateOracle);
        console2.log("AILiquidityManager: setAIDebateOracle OK");

        vm.stopBroadcast();
        console2.log("=== Phase 4 Complete - ALL DONE! ===");
    }
}
