// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {Arena} from "../src/Arena.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {IWarriorsNFT} from "../src/Interfaces/IWarriorsNFT.sol";

// ============================================================
// Mock WarriorsNFT -- minimal implementation for Arena tests
// ============================================================
contract MockWarriorsNFT {
    // ---- storage -------------------------------------------
    mapping(uint256 => address) private _owners;
    mapping(uint256 => IWarriorsNFT.Ranking) private _rankings;
    mapping(uint256 => IWarriorsNFT.Traits) private _traits;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // ---- helpers used by test setup ------------------------
    function mintWarrior(
        address to,
        uint256 tokenId,
        IWarriorsNFT.Ranking ranking,
        uint16 strength,
        uint16 wit,
        uint16 charisma,
        uint16 defence,
        uint16 luck
    ) external {
        _owners[tokenId] = to;
        _rankings[tokenId] = ranking;
        _traits[tokenId] = IWarriorsNFT.Traits({
            strength: strength,
            wit: wit,
            charisma: charisma,
            defence: defence,
            luck: luck
        });
    }

    // ---- IWarriorsNFT view functions used by Arena ----------
    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }

    function getRanking(uint256 tokenId) external view returns (IWarriorsNFT.Ranking) {
        return _rankings[tokenId];
    }

    function getTraits(uint256 tokenId) external view returns (IWarriorsNFT.Traits memory) {
        return _traits[tokenId];
    }

    // ---- ERC721 stubs that Arena / finishGame may touch -----
    function balanceOf(address) external pure returns (uint256) {
        return 1;
    }

    function getApproved(uint256) external pure returns (address) {
        return address(0);
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
    }

    function approve(address, uint256) external pure {}

    function transferFrom(address, address, uint256) external pure {}

    function safeTransferFrom(address, address, uint256) external pure {}

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {}

    function supportsInterface(bytes4) external pure returns (bool) {
        return true;
    }

    // ---- Stubs for remaining IWarriorsNFT functions ---------
    function increaseWinnings(uint256, uint256) external pure {}

    function getMoves(uint256) external pure returns (IWarriorsNFT.Moves memory) {
        return IWarriorsNFT.Moves({
            strike: "strike",
            taunt: "taunt",
            dodge: "dodge",
            special: "special",
            recover: "recover"
        });
    }

    function getWinnings(uint256) external pure returns (uint256) {
        return 0;
    }
}

// ============================================================
// Mock ArenaFactory -- the test contract itself acts as factory,
// but we also need a mock that Arena can call updateWinnings on
// during finishGame. We make the test contract implement it.
// ============================================================

// ============================================================
// Test Contract
// ============================================================
contract ArenaTest is Test {
    // ---- contracts -----------------------------------------
    Arena public arena;
    CrownToken public crownToken;
    MockWarriorsNFT public warriorsNFT;

    // ---- actors --------------------------------------------
    address public aiPublicKey;
    uint256 public aiPrivateKey;
    address public bettor1;
    address public bettor2;
    address public bettor3;

    // ---- default constructor params ------------------------
    uint256 public constant COST_TO_INFLUENCE = 0.01 ether;
    uint256 public constant COST_TO_DEFLUENCE = 0.01 ether;
    uint256 public constant BET_AMOUNT = 0.1 ether;
    IWarriorsNFT.Ranking public constant RANK = IWarriorsNFT.Ranking.BRONZE;

    // ---- warrior NFT IDs -----------------------------------
    uint256 public constant WARRIOR_ONE_ID = 1;
    uint256 public constant WARRIOR_TWO_ID = 2;

    // ---- events (re-declared for vm.expectEmit) ------------
    event GameInitialized(
        uint256 indexed WarriorsOneNFTId,
        uint256 indexed WarriorsTwoNFTId,
        uint256 indexed gameInitializedAt
    );
    event BetPlacedOnWarriorsOne(address indexed player, uint256 indexed multiplier, uint256 indexed betAmount);
    event BetPlacedOnWarriorsTwo(address indexed player, uint256 indexed multiplier, uint256 indexed betAmount);

    // ---- IArenaFactory stub (this contract is the factory) --
    // Arena calls i_ArenaFactory.updateWinnings() in finishGame.
    // Since *this* test contract deploys the Arena, msg.sender == address(this) == i_ArenaFactory.
    function updateWinnings(uint256, uint256) external pure {}

    // ========================================================
    // Setup
    // ========================================================
    function setUp() public {
        // Create AI key pair for signature verification
        (aiPublicKey, aiPrivateKey) = makeAddrAndKey("aiAgent");

        // Named actors
        bettor1 = makeAddr("bettor1");
        bettor2 = makeAddr("bettor2");
        bettor3 = makeAddr("bettor3");

        // Deploy CrownToken
        crownToken = new CrownToken();

        // Deploy MockWarriorsNFT and mint two warriors with BRONZE ranking
        warriorsNFT = new MockWarriorsNFT();
        warriorsNFT.mintWarrior(
            makeAddr("owner1"),
            WARRIOR_ONE_ID,
            RANK,
            5000, // strength
            4000, // wit
            3000, // charisma
            3500, // defence
            5000  // luck
        );
        warriorsNFT.mintWarrior(
            makeAddr("owner2"),
            WARRIOR_TWO_ID,
            RANK,
            4500, // strength
            4500, // wit
            3500, // charisma
            4000, // defence
            4500  // luck
        );

        // Deploy Arena (this contract becomes i_ArenaFactory)
        arena = new Arena(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(crownToken),
            aiPublicKey,
            address(warriorsNFT),
            BET_AMOUNT,
            RANK
        );

        // Fund actors with ETH so they can mint CrownTokens
        vm.deal(bettor1, 100 ether);
        vm.deal(bettor2, 100 ether);
        vm.deal(bettor3, 100 ether);

        // Set a sane block number / timestamp so blockhash(block.number - 1) is non-zero
        vm.roll(100);
        vm.warp(1000);
    }

    // ========================================================
    // Helpers
    // ========================================================

    /// @notice Mint CrownTokens for a user and approve the Arena to spend them.
    function _mintAndApprove(address user, uint256 amount) internal {
        vm.startPrank(user);
        crownToken.mint{value: amount}(amount);
        crownToken.approve(address(arena), amount);
        vm.stopPrank();
    }

    /// @notice Standard game initialization (used by multiple tests).
    function _initializeGame() internal {
        arena.initializeGame(WARRIOR_ONE_ID, WARRIOR_TWO_ID);
    }

    // ========================================================
    // 1. testDeployment
    // ========================================================
    function testDeployment() public view {
        // Immutable / constructor-set values
        assertEq(arena.getCrownTokenAddress(), address(crownToken), "CrownToken address mismatch");
        assertEq(arena.getAiPublicKey(), aiPublicKey, "AI public key mismatch");
        assertEq(arena.getCostToInfluence(), COST_TO_INFLUENCE, "costToInfluence mismatch");
        assertEq(arena.getCostToDefluence(), COST_TO_DEFLUENCE, "costToDefluence mismatch");
        assertEq(arena.getBetAmount(), BET_AMOUNT, "betAmount mismatch");

        // Dynamic influence/defluence costs should start equal to base cost
        assertEq(arena.getCostToInfluenceWarriorsOne(), COST_TO_INFLUENCE, "Warriors One influence cost mismatch");
        assertEq(arena.getCostToInfluenceWarriorsTwo(), COST_TO_INFLUENCE, "Warriors Two influence cost mismatch");
        assertEq(arena.getCostToDefluenceWarriorsOne(), COST_TO_DEFLUENCE, "Warriors One defluence cost mismatch");
        assertEq(arena.getCostToDefluenceWarriorsTwo(), COST_TO_DEFLUENCE, "Warriors Two defluence cost mismatch");

        // Game state defaults
        assertEq(arena.getCurrentRound(), 0, "Round should be 0 before init");
        assertEq(arena.getInitializationStatus(), false, "Game should not be initialized yet");
        assertEq(arena.getBattleStatus(), false, "Battle should not be ongoing");
        assertEq(arena.getWarriorsOneNFTId(), 0, "Warriors One ID should be 0 before init");
        assertEq(arena.getWarriorsTwoNFTId(), 0, "Warriors Two ID should be 0 before init");
        assertEq(arena.getDamageOnWarriorsOne(), 0, "Damage on Warriors One should be 0");
        assertEq(arena.getDamageOnWarriorsTwo(), 0, "Damage on Warriors Two should be 0");
        assertEq(arena.getGameInitializedAt(), 0, "gameInitializedAt should be 0");
        assertEq(arena.getLastRoundEndedAt(), 0, "lastRoundEndedAt should be 0");
    }

    // ========================================================
    // 2. testRevertInvalidConstructorParams
    // ========================================================
    function testRevertInvalidConstructorParams_ZeroCrownTokenAddress() public {
        vm.expectRevert(Arena.Arena__InvalidTokenAddress.selector);
        new Arena(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(0), // zero CrownToken address
            aiPublicKey,
            address(warriorsNFT),
            BET_AMOUNT,
            RANK
        );
    }

    function testRevertInvalidConstructorParams_ZeroCostToInfluence() public {
        vm.expectRevert(Arena.Arena__CostCannotBeZero.selector);
        new Arena(
            0, // zero cost to influence
            COST_TO_DEFLUENCE,
            address(crownToken),
            aiPublicKey,
            address(warriorsNFT),
            BET_AMOUNT,
            RANK
        );
    }

    function testRevertInvalidConstructorParams_ZeroCostToDefluence() public {
        vm.expectRevert(Arena.Arena__CostCannotBeZero.selector);
        new Arena(
            COST_TO_INFLUENCE,
            0, // zero cost to defluence
            address(crownToken),
            aiPublicKey,
            address(warriorsNFT),
            BET_AMOUNT,
            RANK
        );
    }

    function testRevertInvalidConstructorParams_ZeroAiPublicKey() public {
        vm.expectRevert(Arena.Arena__InvalidAddress.selector);
        new Arena(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(crownToken),
            address(0), // zero AI public key
            address(warriorsNFT),
            BET_AMOUNT,
            RANK
        );
    }

    function testRevertInvalidConstructorParams_ZeroWarriorsNFTCollection() public {
        vm.expectRevert(Arena.Arena__InvalidAddress.selector);
        new Arena(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(crownToken),
            aiPublicKey,
            address(0), // zero Warriors NFT collection
            BET_AMOUNT,
            RANK
        );
    }

    function testRevertInvalidConstructorParams_ZeroBetAmount() public {
        vm.expectRevert(Arena.Arena__InvalidBetAmount.selector);
        new Arena(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(crownToken),
            aiPublicKey,
            address(warriorsNFT),
            0, // zero bet amount
            RANK
        );
    }

    // ========================================================
    // 3. testInitializeGame
    // ========================================================
    function testInitializeGame() public {
        _initializeGame();

        assertTrue(arena.getInitializationStatus(), "Game should be initialized");
        assertEq(arena.getWarriorsOneNFTId(), WARRIOR_ONE_ID, "Warriors One NFT ID mismatch");
        assertEq(arena.getWarriorsTwoNFTId(), WARRIOR_TWO_ID, "Warriors Two NFT ID mismatch");
        assertEq(arena.getGameInitializedAt(), block.timestamp, "gameInitializedAt should be current timestamp");
        assertTrue(arena.getIsBettingPeriodGoingOn(), "Betting period should be active after init");
        assertEq(arena.getCurrentRound(), 0, "Round should still be 0 (game not started)");

        // battleId should be non-zero
        assertTrue(arena.getBattleId() != 0, "Battle ID should be set (non-zero)");
    }

    function testInitializeGameEmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit GameInitialized(WARRIOR_ONE_ID, WARRIOR_TWO_ID, block.timestamp);

        _initializeGame();
    }

    // ========================================================
    // 4. testCannotInitializeTwice
    // ========================================================
    function testCannotInitializeTwice() public {
        _initializeGame();

        vm.expectRevert(Arena.Arena__GameAlreadyInitialized.selector);
        arena.initializeGame(WARRIOR_ONE_ID, WARRIOR_TWO_ID);
    }

    // ========================================================
    // 5. testCannotInitializeWithSameWarriors
    // ========================================================
    function testCannotInitializeWithSameWarriors() public {
        vm.expectRevert(Arena.Arena__WarriorsIdsCannotBeSame.selector);
        arena.initializeGame(WARRIOR_ONE_ID, WARRIOR_ONE_ID);
    }

    function testCannotInitializeWithZeroWarriorId() public {
        vm.expectRevert(Arena.Arena__InvalidTokenAddress.selector);
        arena.initializeGame(0, WARRIOR_TWO_ID);
    }

    function testCannotInitializeWithZeroWarriorIdTwo() public {
        vm.expectRevert(Arena.Arena__InvalidTokenAddress.selector);
        arena.initializeGame(WARRIOR_ONE_ID, 0);
    }

    function testCannotInitializeWithMismatchedRankings() public {
        // Mint a warrior with a different ranking (SILVER instead of BRONZE)
        uint256 silverWarriorId = 99;
        warriorsNFT.mintWarrior(
            makeAddr("owner3"),
            silverWarriorId,
            IWarriorsNFT.Ranking.SILVER,
            5000, 4000, 3000, 3500, 5000
        );

        vm.expectRevert(Arena.Arena__InvalidRankCategory.selector);
        arena.initializeGame(WARRIOR_ONE_ID, silverWarriorId);
    }

    // ========================================================
    // 6. testBlockBasedRandomness
    // ========================================================
    /// @notice Verify that the randomness output changes when block number
    ///         and timestamp change. We cannot call _getRandomness directly
    ///         (it is private), so we test it indirectly by observing that
    ///         battleId (which uses keccak256 with block.timestamp) changes
    ///         when we warp time, and we additionally deploy two arenas at
    ///         different blocks to confirm distinct battleIds.
    function testBlockBasedRandomness() public {
        // ---- Arena A: initialize at block 100, ts 1000 -----
        Arena arenaA = new Arena(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(crownToken),
            aiPublicKey,
            address(warriorsNFT),
            BET_AMOUNT,
            RANK
        );
        vm.roll(100);
        vm.warp(1000);
        arenaA.initializeGame(WARRIOR_ONE_ID, WARRIOR_TWO_ID);
        uint256 battleIdA = arenaA.getBattleId();

        // ---- Arena B: initialize at block 200, ts 2000 -----
        Arena arenaB = new Arena(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(crownToken),
            aiPublicKey,
            address(warriorsNFT),
            BET_AMOUNT,
            RANK
        );
        vm.roll(200);
        vm.warp(2000);
        arenaB.initializeGame(WARRIOR_ONE_ID, WARRIOR_TWO_ID);
        uint256 battleIdB = arenaB.getBattleId();

        // BattleId is derived from keccak256(warrior1, warrior2, block.timestamp, address(this)).
        // Different addresses *and* different timestamps guarantee different IDs.
        assertTrue(battleIdA != battleIdB, "Battle IDs should differ across different blocks / timestamps");

        // ---- Arena C: same block as B but different contract address ----
        Arena arenaC = new Arena(
            COST_TO_INFLUENCE,
            COST_TO_DEFLUENCE,
            address(crownToken),
            aiPublicKey,
            address(warriorsNFT),
            BET_AMOUNT,
            RANK
        );
        // Same block/time as arenaB but arenaC has a different address
        arenaC.initializeGame(WARRIOR_ONE_ID, WARRIOR_TWO_ID);
        uint256 battleIdC = arenaC.getBattleId();

        assertTrue(battleIdB != battleIdC, "Battle IDs should differ for different contract addresses at same block");

        // ---- Verify vm.roll / vm.warp propagate correctly ----
        vm.roll(300);
        vm.warp(3000);
        assertEq(block.number, 300, "Block number should be 300 after vm.roll");
        assertEq(block.timestamp, 3000, "Timestamp should be 3000 after vm.warp");

        // Additional check: blockhash of the previous block should be non-zero
        // (Foundry populates blockhashes for recent blocks after vm.roll)
        bytes32 prevHash = blockhash(block.number - 1);
        assertTrue(prevHash != bytes32(0), "blockhash(block.number-1) should be non-zero after vm.roll");
    }

    // ========================================================
    // 7. testGetterFunctions
    // ========================================================
    function testGetterFunctions() public {
        // --- Pre-initialization getters ---------------------
        assertEq(arena.getMinWarriorsBettingPeriod(), 60, "MIN_Warriors_BETTING_PERIOD should be 60");
        assertEq(arena.getMinBattleRoundsInterval(), 30, "MIN_BATTLE_ROUNDS_INTERVAL should be 30");
        assertEq(arena.getMicroMarketFactory(), address(0), "MicroMarketFactory should be zero initially");

        // Empty bet address arrays
        address[] memory p1Bets = arena.getPlayerOneBetAddresses();
        address[] memory p2Bets = arena.getPlayerTwoBetAddresses();
        assertEq(p1Bets.length, 0, "Player one bet addresses should be empty");
        assertEq(p2Bets.length, 0, "Player two bet addresses should be empty");

        // --- Post-initialization getters --------------------
        _initializeGame();

        assertEq(arena.getWarriorsOneNFTId(), WARRIOR_ONE_ID, "Warriors One ID getter mismatch");
        assertEq(arena.getWarriorsTwoNFTId(), WARRIOR_TWO_ID, "Warriors Two ID getter mismatch");
        assertTrue(arena.getInitializationStatus(), "Initialization status should be true");
        assertFalse(arena.getBattleStatus(), "Battle should not be ongoing");
        assertTrue(arena.getIsBettingPeriodGoingOn(), "Betting period should be active");
        assertEq(arena.getCurrentRound(), 0, "Round should be 0 before startGame");
        assertEq(arena.getDamageOnWarriorsOne(), 0, "Damage on W1 should be 0");
        assertEq(arena.getDamageOnWarriorsTwo(), 0, "Damage on W2 should be 0");
        assertEq(arena.getGameInitializedAt(), block.timestamp, "gameInitializedAt getter mismatch");
        assertEq(arena.getLastRoundEndedAt(), 0, "lastRoundEndedAt should be 0 before game starts");

        // Cost getters should still equal base costs
        assertEq(arena.getCostToInfluenceWarriorsOne(), COST_TO_INFLUENCE);
        assertEq(arena.getCostToInfluenceWarriorsTwo(), COST_TO_INFLUENCE);
        assertEq(arena.getCostToDefluenceWarriorsOne(), COST_TO_DEFLUENCE);
        assertEq(arena.getCostToDefluenceWarriorsTwo(), COST_TO_DEFLUENCE);
    }

    // ========================================================
    // 8. testBettingFlow
    // ========================================================
    function testBettingFlow() public {
        _initializeGame();

        // Mint CrownTokens and approve Arena for bettor1 & bettor2
        uint256 mintAmount = 1 ether;
        _mintAndApprove(bettor1, mintAmount);
        _mintAndApprove(bettor2, mintAmount);

        // ---- bettor1 bets on Warriors One (multiplier = 1) ----
        vm.prank(bettor1);
        arena.betOnWarriorsOne(1);

        address[] memory p1Addrs = arena.getPlayerOneBetAddresses();
        assertEq(p1Addrs.length, 1, "Should have 1 entry for Warriors One bets");
        assertEq(p1Addrs[0], bettor1, "First bet address for W1 should be bettor1");
        assertEq(crownToken.balanceOf(bettor1), mintAmount - BET_AMOUNT, "bettor1 CRwN balance after bet");

        // ---- bettor2 bets on Warriors Two (multiplier = 2) ----
        vm.prank(bettor2);
        arena.betOnWarriorsTwo(2);

        address[] memory p2Addrs = arena.getPlayerTwoBetAddresses();
        assertEq(p2Addrs.length, 2, "Should have 2 entries for Warriors Two bets (multiplier=2)");
        assertEq(p2Addrs[0], bettor2, "First bet address for W2 should be bettor2");
        assertEq(p2Addrs[1], bettor2, "Second bet address for W2 should be bettor2");
        assertEq(crownToken.balanceOf(bettor2), mintAmount - (BET_AMOUNT * 2), "bettor2 CRwN balance after bet");

        // Arena should hold total bet tokens
        uint256 expectedArenaBalance = BET_AMOUNT + (BET_AMOUNT * 2);
        assertEq(crownToken.balanceOf(address(arena)), expectedArenaBalance, "Arena CRwN balance mismatch");
    }

    function testBettingEmitsEvents() public {
        _initializeGame();
        _mintAndApprove(bettor1, 1 ether);

        vm.expectEmit(true, true, true, true);
        emit BetPlacedOnWarriorsOne(bettor1, 1, BET_AMOUNT);

        vm.prank(bettor1);
        arena.betOnWarriorsOne(1);
    }

    function testBettingRevertsBeforeInitialization() public {
        _mintAndApprove(bettor1, 1 ether);

        vm.prank(bettor1);
        vm.expectRevert(Arena.Arena__GameNotStartedYet.selector);
        arena.betOnWarriorsOne(1);
    }

    function testBettingRevertsWithZeroMultiplier() public {
        _initializeGame();
        _mintAndApprove(bettor1, 1 ether);

        vm.prank(bettor1);
        vm.expectRevert(Arena.Arena__InvalidBetAmount.selector);
        arena.betOnWarriorsOne(0);
    }

    function testBettingRevertsWithZeroMultiplierWarriorsTwo() public {
        _initializeGame();
        _mintAndApprove(bettor1, 1 ether);

        vm.prank(bettor1);
        vm.expectRevert(Arena.Arena__InvalidBetAmount.selector);
        arena.betOnWarriorsTwo(0);
    }

    function testBettingOnWarriorsTwoRevertsBeforeInitialization() public {
        _mintAndApprove(bettor1, 1 ether);

        vm.prank(bettor1);
        vm.expectRevert(Arena.Arena__GameNotStartedYet.selector);
        arena.betOnWarriorsTwo(1);
    }

    function testMultipleBettorsOnBothSides() public {
        _initializeGame();
        _mintAndApprove(bettor1, 1 ether);
        _mintAndApprove(bettor2, 1 ether);
        _mintAndApprove(bettor3, 1 ether);

        // bettor1 -> Warriors One x 3
        vm.prank(bettor1);
        arena.betOnWarriorsOne(3);

        // bettor2 -> Warriors Two x 1
        vm.prank(bettor2);
        arena.betOnWarriorsTwo(1);

        // bettor3 -> Warriors Two x 2
        vm.prank(bettor3);
        arena.betOnWarriorsTwo(2);

        address[] memory p1 = arena.getPlayerOneBetAddresses();
        address[] memory p2 = arena.getPlayerTwoBetAddresses();

        assertEq(p1.length, 3, "Warriors One should have 3 entries");
        assertEq(p2.length, 3, "Warriors Two should have 3 entries (1+2)");

        // Verify total CrownToken held by Arena
        uint256 totalBets = (BET_AMOUNT * 3) + (BET_AMOUNT * 1) + (BET_AMOUNT * 2);
        assertEq(crownToken.balanceOf(address(arena)), totalBets, "Arena should hold all bet tokens");
    }

    // ========================================================
    // Additional edge-case tests
    // ========================================================

    /// @notice setMicroMarketFactory can only be called by i_ArenaFactory (this contract).
    function testSetMicroMarketFactoryOnlyFactory() public {
        address mockFactory = makeAddr("microMarketFactory");

        // Calling from this test contract (which is the ArenaFactory) should succeed
        arena.setMicroMarketFactory(mockFactory);
        assertEq(arena.getMicroMarketFactory(), mockFactory, "MicroMarketFactory should be set");

        // Calling from an unauthorized address should revert
        vm.prank(bettor1);
        vm.expectRevert(Arena.Arena__Unauthorized.selector);
        arena.setMicroMarketFactory(makeAddr("other"));
    }

    /// @notice Betting should revert after startGame has been called (round != 0).
    function testBettingRevertsAfterGameStarted() public {
        _initializeGame();

        _mintAndApprove(bettor1, 1 ether);
        _mintAndApprove(bettor2, 1 ether);

        // Place bets on both sides
        vm.prank(bettor1);
        arena.betOnWarriorsOne(1);

        vm.prank(bettor2);
        arena.betOnWarriorsTwo(1);

        // Advance past the betting period (MIN_Warriors_BETTING_PERIOD = 60 seconds)
        vm.warp(block.timestamp + 61);

        // Start the game
        arena.startGame();

        // Now betting should revert with GameAlreadyStarted
        _mintAndApprove(bettor3, 1 ether);

        vm.prank(bettor3);
        vm.expectRevert(Arena.Arena__GameAlreadyStarted.selector);
        arena.betOnWarriorsOne(1);

        vm.prank(bettor3);
        vm.expectRevert(Arena.Arena__GameAlreadyStarted.selector);
        arena.betOnWarriorsTwo(1);
    }

    /// @notice startGame reverts if the betting period has not yet elapsed.
    function testStartGameRevertsBettingPeriodNotOver() public {
        _initializeGame();

        _mintAndApprove(bettor1, 1 ether);
        _mintAndApprove(bettor2, 1 ether);

        vm.prank(bettor1);
        arena.betOnWarriorsOne(1);

        vm.prank(bettor2);
        arena.betOnWarriorsTwo(1);

        // Do NOT advance time -- betting period still active
        vm.expectRevert(Arena.Arena__BettingPeriodStillGoingOn.selector);
        arena.startGame();
    }

    /// @notice startGame reverts if the game was not initialized.
    function testStartGameRevertsNotInitialized() public {
        // Advance time to satisfy the timestamp check (gameInitializedAt is 0, so 0 + 60 < any reasonable timestamp)
        vm.warp(1000);
        vm.expectRevert(Arena.Arena__GameNotInitializedYet.selector);
        arena.startGame();
    }

    /// @notice finishGame reverts when round < 6.
    function testFinishGameRevertsConditionNotMet() public {
        _initializeGame();

        vm.expectRevert(Arena.Arena__GameFinishConditionNotMet.selector);
        arena.finishGame();
    }
}
