// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {AILiquidityManager} from "../src/AILiquidityManager.sol";

contract AILiquidityManagerTest is Test {
    CrownToken public crownToken;
    AILiquidityManager public liqManager;

    address public owner;
    address public provider1;
    address public aiAgent;

    uint256 constant INITIAL_ETH = 1000 ether;

    function setUp() public {
        owner = address(this);
        provider1 = makeAddr("provider1");
        aiAgent = makeAddr("aiAgent");

        crownToken = new CrownToken();
        liqManager = new AILiquidityManager(address(crownToken));

        // Set prediction market (use owner as placeholder)
        liqManager.setPredictionMarket(owner);
        liqManager.authorizeAgent(aiAgent, true);

        // Fund users
        vm.deal(provider1, INITIAL_ETH);
        vm.prank(provider1);
        crownToken.mint{value: 500 ether}(500 ether);
    }

    function test_CreatePosition() public {
        vm.startPrank(provider1);
        crownToken.approve(address(liqManager), 100 ether);

        AILiquidityManager.StrategyParams memory params = AILiquidityManager.StrategyParams({
            targetYesRatio: 5000, // 50%
            rebalanceThreshold: 1000, // 10%
            minRebalanceInterval: 300, // 5 min
            maxSlippage: 200, // 2%
            maxExposure: 1000 ether,
            enableHedging: false,
            enableJIT: false
        });

        liqManager.createPosition(
            1, // marketId
            AILiquidityManager.LiquidityStrategy.PASSIVE,
            100 ether,
            params
        );
        vm.stopPrank();
    }

    function test_AddLiquidity() public {
        // Create position first
        vm.startPrank(provider1);
        crownToken.approve(address(liqManager), 200 ether);

        AILiquidityManager.StrategyParams memory params = AILiquidityManager.StrategyParams({
            targetYesRatio: 5000,
            rebalanceThreshold: 1000,
            minRebalanceInterval: 300,
            maxSlippage: 200,
            maxExposure: 1000 ether,
            enableHedging: false,
            enableJIT: false
        });

        liqManager.createPosition(1, AILiquidityManager.LiquidityStrategy.PASSIVE, 100 ether, params);
        liqManager.addLiquidity(1, 50 ether);
        vm.stopPrank();
    }

    function test_RemoveLiquidity() public {
        vm.startPrank(provider1);
        crownToken.approve(address(liqManager), 200 ether);

        AILiquidityManager.StrategyParams memory params = AILiquidityManager.StrategyParams({
            targetYesRatio: 5000,
            rebalanceThreshold: 1000,
            minRebalanceInterval: 300,
            maxSlippage: 200,
            maxExposure: 1000 ether,
            enableHedging: false,
            enableJIT: false
        });

        liqManager.createPosition(1, AILiquidityManager.LiquidityStrategy.PASSIVE, 100 ether, params);
        liqManager.removeLiquidity(1, 30 ether);
        vm.stopPrank();
    }

    function test_SetVolatilityScore() public {
        vm.prank(aiAgent);
        liqManager.setVolatilityScore(1, 5000); // 50% volatility
    }

    function test_AuthorizeAgent() public {
        address newAgent = makeAddr("newAgent");
        liqManager.authorizeAgent(newAgent, true);
    }

    function test_PauseAndResume() public {
        vm.startPrank(provider1);
        crownToken.approve(address(liqManager), 100 ether);

        AILiquidityManager.StrategyParams memory params = AILiquidityManager.StrategyParams({
            targetYesRatio: 5000,
            rebalanceThreshold: 1000,
            minRebalanceInterval: 300,
            maxSlippage: 200,
            maxExposure: 1000 ether,
            enableHedging: false,
            enableJIT: false
        });

        liqManager.createPosition(1, AILiquidityManager.LiquidityStrategy.PASSIVE, 100 ether, params);
        liqManager.pausePosition(1);
        liqManager.resumePosition(1);
        vm.stopPrank();
    }
}
