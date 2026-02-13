// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ArenaFactory} from "../src/ArenaFactory.sol";
import {Arena} from "../src/Arena.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {IWarriorsNFT} from "../src/Interfaces/IWarriorsNFT.sol";

/**
 * @title MockWarriorsNFT
 * @notice Minimal mock of the IWarriorsNFT interface for ArenaFactory tests.
 */
contract MockWarriorsNFT {
    mapping(uint256 => uint256) private winnings;

    function increaseWinnings(uint256 _tokenId, uint256 _amount) external {
        winnings[_tokenId] += _amount;
    }

    function getWinnings(uint256 _tokenId) external view returns (uint256) {
        return winnings[_tokenId];
    }
}

/**
 * @title ArenaFactoryTest
 * @notice Comprehensive Foundry tests for the ArenaFactory contract.
 */
contract ArenaFactoryTest is Test {
    ArenaFactory public factory;
    CrownToken public crownToken;
    MockWarriorsNFT public warriorsNFT;

    address public aiPublicKey;

    uint256 constant COST_TO_INFLUENCE = 1 ether;
    uint256 constant COST_TO_DEFLUENCE = 1 ether;
    uint256 constant BET_AMOUNT = 1 ether;

    function setUp() public {
        crownToken = new CrownToken();
        warriorsNFT = new MockWarriorsNFT();
        aiPublicKey = makeAddr("aiPublicKey");

        factory = new ArenaFactory(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(crownToken),
            aiPublicKey,
            address(warriorsNFT),
            BET_AMOUNT
        );
    }

    // ---------------------------------------------------------------
    // Test 1: testDeploymentCreates5Arenas
    // ---------------------------------------------------------------
    function testDeploymentCreates5Arenas() public view {
        address[] memory arenas = factory.getArenas();
        assertEq(arenas.length, 5, "Constructor should create exactly 5 arenas");
    }

    // ---------------------------------------------------------------
    // Test 2: testArenaRankings
    // ---------------------------------------------------------------
    function testArenaRankings() public view {
        address[] memory arenas = factory.getArenas();

        assertEq(
            uint256(factory.getArenaRanking(arenas[0])),
            uint256(IWarriorsNFT.Ranking.UNRANKED),
            "Arena 0 should be UNRANKED"
        );
        assertEq(
            uint256(factory.getArenaRanking(arenas[1])),
            uint256(IWarriorsNFT.Ranking.BRONZE),
            "Arena 1 should be BRONZE"
        );
        assertEq(
            uint256(factory.getArenaRanking(arenas[2])),
            uint256(IWarriorsNFT.Ranking.SILVER),
            "Arena 2 should be SILVER"
        );
        assertEq(
            uint256(factory.getArenaRanking(arenas[3])),
            uint256(IWarriorsNFT.Ranking.GOLD),
            "Arena 3 should be GOLD"
        );
        assertEq(
            uint256(factory.getArenaRanking(arenas[4])),
            uint256(IWarriorsNFT.Ranking.PLATINUM),
            "Arena 4 should be PLATINUM"
        );
    }

    // ---------------------------------------------------------------
    // Test 3: testIsArenaAddress
    // ---------------------------------------------------------------
    function testIsArenaAddress() public {
        address[] memory arenas = factory.getArenas();

        // Every arena created by the factory should return true
        for (uint256 i = 0; i < arenas.length; i++) {
            assertTrue(factory.isArenaAddress(arenas[i]), "Factory-created arena should be recognized");
        }

        // An arbitrary address that is NOT an arena should return false
        address notAnArena = makeAddr("notAnArena");
        assertFalse(factory.isArenaAddress(notAnArena), "Random address should not be an arena");

        // Zero address should also return false
        assertFalse(factory.isArenaAddress(address(0)), "Zero address should not be an arena");
    }

    // ---------------------------------------------------------------
    // Test 4: testMakeNewArena
    // ---------------------------------------------------------------
    function testMakeNewArena() public {
        // Before: 5 arenas from constructor
        address[] memory arenasBefore = factory.getArenas();
        assertEq(arenasBefore.length, 5);

        // Create a new BRONZE arena
        address newArena = factory.makeNewArena(
            2 ether, // costToInfluence
            2 ether, // costToDefluence
            2 ether, // betAmount
            IWarriorsNFT.Ranking.BRONZE
        );

        // After: should have 6 arenas
        address[] memory arenasAfter = factory.getArenas();
        assertEq(arenasAfter.length, 6, "Should have 6 arenas after makeNewArena");

        // The last arena in the array should be the newly created one
        assertEq(arenasAfter[5], newArena, "Newly created arena should be appended");

        // Newly created arena should be recognized
        assertTrue(factory.isArenaAddress(newArena), "New arena should be a valid arena address");

        // Ranking should match what was passed
        assertEq(
            uint256(factory.getArenaRanking(newArena)),
            uint256(IWarriorsNFT.Ranking.BRONZE),
            "New arena should have BRONZE ranking"
        );
    }

    // ---------------------------------------------------------------
    // Test 5: testRevertInvalidConstructorParams
    // ---------------------------------------------------------------
    function testRevertInvalidConstructorParams() public {
        // Zero crownTokenAddress should revert
        vm.expectRevert(ArenaFactory.ArenaFactory__InvalidAddress.selector);
        new ArenaFactory(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(0), // invalid
            aiPublicKey,
            address(warriorsNFT),
            BET_AMOUNT
        );

        // Zero aiPublicKey should revert
        vm.expectRevert(ArenaFactory.ArenaFactory__InvalidAddress.selector);
        new ArenaFactory(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(crownToken),
            address(0), // invalid
            address(warriorsNFT),
            BET_AMOUNT
        );

        // Zero WarriorsNFTCollection should revert
        vm.expectRevert(ArenaFactory.ArenaFactory__InvalidAddress.selector);
        new ArenaFactory(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(crownToken),
            aiPublicKey,
            address(0), // invalid
            BET_AMOUNT
        );

        // Zero betAmount should revert
        vm.expectRevert(ArenaFactory.ArenaFactory__InvalidBetAmount.selector);
        new ArenaFactory(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(crownToken),
            aiPublicKey,
            address(warriorsNFT),
            0 // invalid
        );

        // Zero costToInfluence should revert
        vm.expectRevert(ArenaFactory.ArenaFactory__InvalidCostToInfluence.selector);
        new ArenaFactory(
            0, // invalid
            COST_TO_DEFLUENCE,
            address(crownToken),
            aiPublicKey,
            address(warriorsNFT),
            BET_AMOUNT
        );

        // Zero costToDefluence should revert
        vm.expectRevert(ArenaFactory.ArenaFactory__InvalidCostToDefluence.selector);
        new ArenaFactory(
            COST_TO_INFLUENCE,
            0, // invalid
            address(crownToken),
            aiPublicKey,
            address(warriorsNFT),
            BET_AMOUNT
        );
    }

    // ---------------------------------------------------------------
    // Test 6: testGetterFunctions
    // ---------------------------------------------------------------
    function testGetterFunctions() public {
        // getCrownTokenAddress
        assertEq(
            factory.getCrownTokenAddress(),
            address(crownToken),
            "getCrownTokenAddress should return the CrownToken address"
        );

        // getWarriorsNFTCollection
        assertEq(
            factory.getWarriorsNFTCollection(),
            address(warriorsNFT),
            "getWarriorsNFTCollection should return the MockWarriorsNFT address"
        );

        // getArenas should return 5 addresses
        address[] memory arenas = factory.getArenas();
        assertEq(arenas.length, 5, "getArenas should return 5 arenas");

        // Each arena should be a non-zero address
        for (uint256 i = 0; i < arenas.length; i++) {
            assertTrue(arenas[i] != address(0), "Arena address should not be zero");
        }

        // getArenaRanking for a known arena
        assertEq(
            uint256(factory.getArenaRanking(arenas[0])),
            uint256(IWarriorsNFT.Ranking.UNRANKED),
            "getArenaRanking should return UNRANKED for arena[0]"
        );

        // isArenaAddress for a known arena
        assertTrue(
            factory.isArenaAddress(arenas[0]),
            "isArenaAddress should return true for arena[0]"
        );

        // getArenaRanking for unknown address returns default (UNRANKED = 0)
        assertEq(
            uint256(factory.getArenaRanking(makeAddr("unknown"))),
            uint256(IWarriorsNFT.Ranking.UNRANKED),
            "getArenaRanking for unknown address should return UNRANKED (default)"
        );
    }

    // ---------------------------------------------------------------
    // Test 7: testGetArenasOfARanking
    // ---------------------------------------------------------------
    function testGetArenasOfARanking() public {
        // After constructor, each ranking has exactly 1 arena
        address[] memory unrankedArenas = factory.getArenasOfARanking(IWarriorsNFT.Ranking.UNRANKED);
        assertEq(unrankedArenas.length, 1, "Should have 1 UNRANKED arena initially");

        address[] memory bronzeArenas = factory.getArenasOfARanking(IWarriorsNFT.Ranking.BRONZE);
        assertEq(bronzeArenas.length, 1, "Should have 1 BRONZE arena initially");

        address[] memory silverArenas = factory.getArenasOfARanking(IWarriorsNFT.Ranking.SILVER);
        assertEq(silverArenas.length, 1, "Should have 1 SILVER arena initially");

        address[] memory goldArenas = factory.getArenasOfARanking(IWarriorsNFT.Ranking.GOLD);
        assertEq(goldArenas.length, 1, "Should have 1 GOLD arena initially");

        address[] memory platinumArenas = factory.getArenasOfARanking(IWarriorsNFT.Ranking.PLATINUM);
        assertEq(platinumArenas.length, 1, "Should have 1 PLATINUM arena initially");

        // Add a second BRONZE arena via makeNewArena
        address newBronze = factory.makeNewArena(
            2 ether,
            2 ether,
            2 ether,
            IWarriorsNFT.Ranking.BRONZE
        );

        address[] memory bronzeArenasAfter = factory.getArenasOfARanking(IWarriorsNFT.Ranking.BRONZE);
        assertEq(bronzeArenasAfter.length, 2, "Should have 2 BRONZE arenas after adding one");
        assertEq(bronzeArenasAfter[1], newBronze, "Second BRONZE arena should be the newly created one");

        // Other rankings should be unaffected
        assertEq(
            factory.getArenasOfARanking(IWarriorsNFT.Ranking.UNRANKED).length,
            1,
            "UNRANKED count should still be 1"
        );
        assertEq(
            factory.getArenasOfARanking(IWarriorsNFT.Ranking.SILVER).length,
            1,
            "SILVER count should still be 1"
        );
        assertEq(
            factory.getArenasOfARanking(IWarriorsNFT.Ranking.GOLD).length,
            1,
            "GOLD count should still be 1"
        );
        assertEq(
            factory.getArenasOfARanking(IWarriorsNFT.Ranking.PLATINUM).length,
            1,
            "PLATINUM count should still be 1"
        );
    }

    // ---------------------------------------------------------------
    // Test 8: testScaledCosts
    // ---------------------------------------------------------------
    function testScaledCosts() public view {
        address[] memory arenas = factory.getArenas();

        // Arena 0 = UNRANKED: 1x multiplier
        Arena arena0 = Arena(arenas[0]);
        assertEq(arena0.getCostToInfluence(), COST_TO_INFLUENCE * 1, "UNRANKED costToInfluence should be 1x");
        assertEq(arena0.getCostToDefluence(), COST_TO_DEFLUENCE * 1, "UNRANKED costToDefluence should be 1x");
        assertEq(arena0.getBetAmount(), BET_AMOUNT * 1, "UNRANKED betAmount should be 1x");

        // Arena 1 = BRONZE: 2x multiplier
        Arena arena1 = Arena(arenas[1]);
        assertEq(arena1.getCostToInfluence(), COST_TO_INFLUENCE * 2, "BRONZE costToInfluence should be 2x");
        assertEq(arena1.getCostToDefluence(), COST_TO_DEFLUENCE * 2, "BRONZE costToDefluence should be 2x");
        assertEq(arena1.getBetAmount(), BET_AMOUNT * 2, "BRONZE betAmount should be 2x");

        // Arena 2 = SILVER: 3x multiplier
        Arena arena2 = Arena(arenas[2]);
        assertEq(arena2.getCostToInfluence(), COST_TO_INFLUENCE * 3, "SILVER costToInfluence should be 3x");
        assertEq(arena2.getCostToDefluence(), COST_TO_DEFLUENCE * 3, "SILVER costToDefluence should be 3x");
        assertEq(arena2.getBetAmount(), BET_AMOUNT * 3, "SILVER betAmount should be 3x");

        // Arena 3 = GOLD: 4x multiplier
        Arena arena3 = Arena(arenas[3]);
        assertEq(arena3.getCostToInfluence(), COST_TO_INFLUENCE * 4, "GOLD costToInfluence should be 4x");
        assertEq(arena3.getCostToDefluence(), COST_TO_DEFLUENCE * 4, "GOLD costToDefluence should be 4x");
        assertEq(arena3.getBetAmount(), BET_AMOUNT * 4, "GOLD betAmount should be 4x");

        // Arena 4 = PLATINUM: 5x multiplier
        Arena arena4 = Arena(arenas[4]);
        assertEq(arena4.getCostToInfluence(), COST_TO_INFLUENCE * 5, "PLATINUM costToInfluence should be 5x");
        assertEq(arena4.getCostToDefluence(), COST_TO_DEFLUENCE * 5, "PLATINUM costToDefluence should be 5x");
        assertEq(arena4.getBetAmount(), BET_AMOUNT * 5, "PLATINUM betAmount should be 5x");
    }
}
