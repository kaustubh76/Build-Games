// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {ArenaFactory} from "../src/ArenaFactory.sol";
import {WarriorsNFT} from "../src/WarriorsNFT.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {CreatorRevenueShare} from "../src/CreatorRevenueShare.sol";
import {PredictionMarketAMM} from "../src/PredictionMarketAMM.sol";

contract MarketFactoryTest is Test {
    CrownToken public crownToken;
    MarketFactory public marketFactory;
    ArenaFactory public arenaFactory;
    WarriorsNFT public warriorsNFT;
    MockOracle public mockOracle;
    PredictionMarketAMM public predictionMarket;
    OutcomeToken public outcomeToken;
    CreatorRevenueShare public revenueShare;

    address public owner;
    address public user1;

    uint256 public aiPrivateKey = 0xA11CE;
    address public aiPublicKey;

    uint256 constant INITIAL_ETH = 1000 ether;

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        aiPublicKey = vm.addr(aiPrivateKey);

        crownToken = new CrownToken();
        mockOracle = new MockOracle();
        outcomeToken = new OutcomeToken();
        revenueShare = new CreatorRevenueShare(address(crownToken));

        warriorsNFT = new WarriorsNFT(owner, aiPublicKey, address(mockOracle));

        arenaFactory = new ArenaFactory(
            10 ether,
            5 ether,
            address(crownToken),
            aiPublicKey,
            address(warriorsNFT),
            1 ether
        );

        predictionMarket = new PredictionMarketAMM(
            address(crownToken),
            address(outcomeToken),
            address(revenueShare)
        );

        outcomeToken.setMarketContract(address(predictionMarket));

        marketFactory = new MarketFactory(
            address(predictionMarket),
            address(arenaFactory),
            address(crownToken)
        );

        // Fund users
        vm.deal(user1, INITIAL_ETH);
        vm.deal(owner, INITIAL_ETH);

        vm.prank(user1);
        crownToken.mint{value: 500 ether}(500 ether);

        crownToken.mint{value: 500 ether}(500 ether);
    }

    function test_CreateCategory() public {
        marketFactory.createCategory("Sports", "Sports markets");
    }

    function test_CreateBattleMarket() public {
        // createBattleMarket transfers DEFAULT_LIQUIDITY (100 CRwN) from caller to factory,
        // then factory approves and forwards to PredictionMarketAMM
        crownToken.approve(address(marketFactory), 100 ether);

        uint256 endTime = block.timestamp + 2 hours;
        marketFactory.createBattleMarket(1, 1, 2, endTime);
    }

    function test_OnBattleInitialized() public {
        // Fund factory for auto-market creation
        crownToken.approve(address(marketFactory), 200 ether);
        marketFactory.fundFactory(200 ether);

        uint256 endTime = block.timestamp + 2 hours;
        marketFactory.onBattleInitialized(1, 1, 2, endTime);
    }

    function test_CreateCustomMarket() public {
        marketFactory.createCategory("Custom", "Custom markets");

        vm.startPrank(user1);
        crownToken.approve(address(marketFactory), 200 ether);

        uint256 endTime = block.timestamp + 2 hours;
        marketFactory.createCustomMarket("Will it rain?", 2, endTime, 100 ether);
        vm.stopPrank();
    }

    function test_RecordTrade() public {
        marketFactory.recordTrade(user1, 100 ether);
    }

    function test_RecordMarketResult() public {
        marketFactory.recordTrade(user1, 100 ether);
        marketFactory.recordMarketResult(user1, true, 50);
    }

    function test_SetFeatured() public {
        // createBattleMarket transfers DEFAULT_LIQUIDITY from caller
        crownToken.approve(address(marketFactory), 100 ether);

        uint256 endTime = block.timestamp + 2 hours;
        marketFactory.createBattleMarket(1, 1, 2, endTime);

        marketFactory.setFeatured(1, true);
    }
}
