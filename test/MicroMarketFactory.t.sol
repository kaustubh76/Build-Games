// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {MicroMarketFactory} from "../src/MicroMarketFactory.sol";
import {ArenaFactory} from "../src/ArenaFactory.sol";
import {WarriorsNFT} from "../src/WarriorsNFT.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";

contract MicroMarketFactoryTest is Test {
    CrownToken public crownToken;
    MicroMarketFactory public microMarket;
    ArenaFactory public arenaFactory;
    WarriorsNFT public warriorsNFT;
    MockOracle public mockOracle;

    address public owner;
    address public user1;
    address public user2;

    uint256 public aiPrivateKey = 0xA11CE;
    address public aiPublicKey;

    uint256 constant INITIAL_ETH = 1000 ether;

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        aiPublicKey = vm.addr(aiPrivateKey);

        crownToken = new CrownToken();
        mockOracle = new MockOracle();
        warriorsNFT = new WarriorsNFT(owner, aiPublicKey, address(mockOracle));

        arenaFactory = new ArenaFactory(
            10 ether, // costToInfluence
            5 ether,  // costToDefluence
            address(crownToken),
            aiPublicKey,
            address(warriorsNFT),
            1 ether   // betAmount
        );

        microMarket = new MicroMarketFactory(
            address(crownToken),
            address(arenaFactory)
        );

        // Fund users
        vm.deal(user1, INITIAL_ETH);
        vm.deal(user2, INITIAL_ETH);

        vm.prank(user1);
        crownToken.mint{value: 500 ether}(500 ether);

        vm.prank(user2);
        crownToken.mint{value: 500 ether}(500 ether);
    }

    function test_CreateRoundWinnerMarket() public {
        uint256 endTime = block.timestamp + 1 hours;

        microMarket.createRoundWinnerMarket(1, 1, 2, 1, endTime);
    }

    function test_CreateMovePredictionMarket() public {
        uint256 endTime = block.timestamp + 1 hours;

        microMarket.createMovePredictionMarket(
            1, 1,
            MicroMarketFactory.PlayerMoves.STRIKE,
            1,
            endTime
        );
    }

    function test_CreateDamageThresholdMarket() public {
        uint256 endTime = block.timestamp + 1 hours;

        microMarket.createDamageThresholdMarket(1, 50, 1, endTime);
    }

    function test_BuyOutcomeTokens() public {
        uint256 endTime = block.timestamp + 1 hours;
        microMarket.createRoundWinnerMarket(1, 1, 2, 1, endTime);

        vm.startPrank(user1);
        crownToken.approve(address(microMarket), 10 ether);
        microMarket.buy(1, true, 10 ether, 0);
        vm.stopPrank();
    }

    function test_ResolveMarket() public {
        uint256 endTime = block.timestamp + 1 hours;
        microMarket.createRoundWinnerMarket(1, 1, 2, 1, endTime);

        // Owner resolves market
        microMarket.resolveMarket(1, MicroMarketFactory.Outcome.YES);
    }

    function test_ClaimWinnings() public {
        uint256 endTime = block.timestamp + 1 hours;
        microMarket.createRoundWinnerMarket(1, 1, 2, 1, endTime);

        // User buys YES tokens
        vm.startPrank(user1);
        crownToken.approve(address(microMarket), 10 ether);
        microMarket.buy(1, true, 10 ether, 0);
        vm.stopPrank();

        // Resolve as YES
        microMarket.resolveMarket(1, MicroMarketFactory.Outcome.YES);

        // Claim
        vm.prank(user1);
        microMarket.claimWinnings(1);
    }
}
