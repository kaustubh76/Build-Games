// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ExternalMarketMirror} from "../src/ExternalMarketMirror.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {PredictionMarketAMM} from "../src/PredictionMarketAMM.sol";

contract ExternalMarketMirrorTest is Test {
    ExternalMarketMirror public mirror;
    CrownToken public crownToken;
    OutcomeToken public outcomeToken;
    PredictionMarketAMM public predictionMarket;

    address public owner;
    address public oracle;
    address public user1;
    address public user2;
    address public unauthorizedUser;

    uint256 constant INITIAL_BALANCE = 10_000 ether;
    uint256 constant MIRROR_LIQUIDITY = 0.2 ether; // Above MIN_LIQUIDITY (0.1 ether)

    // ============ Events (re-declared for expectEmit) ============

    event MirrorMarketCreated(
        bytes32 indexed mirrorKey,
        uint256 marketId,
        string externalId,
        ExternalMarketMirror.MarketSource source,
        uint256 adjustedPrice
    );

    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    event AgentContractUpdated(address indexed oldContract, address indexed newContract);

    // ============ Setup ============

    function setUp() public {
        owner = address(this);
        oracle = makeAddr("oracle");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        unauthorizedUser = makeAddr("unauthorizedUser");

        // Deploy core tokens
        crownToken = new CrownToken();
        outcomeToken = new OutcomeToken();

        // Deploy PredictionMarketAMM (required dependency for mirror)
        predictionMarket = new PredictionMarketAMM(
            address(crownToken),
            address(outcomeToken),
            oracle
        );

        // Wire OutcomeToken to the PredictionMarketAMM
        outcomeToken.setMarketContract(address(predictionMarket));

        // Deploy ExternalMarketMirror
        mirror = new ExternalMarketMirror(
            address(crownToken),
            address(predictionMarket),
            oracle
        );

        // Fund test accounts with ETH so they can mint CRwN
        vm.deal(owner, INITIAL_BALANCE);
        vm.deal(user1, INITIAL_BALANCE);
        vm.deal(user2, INITIAL_BALANCE);

        // Mint CRwN tokens (requires sending ETH equal to amount)
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);

        vm.prank(user1);
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);

        vm.prank(user2);
        crownToken.mint{value: INITIAL_BALANCE}(INITIAL_BALANCE);
    }

    // ============ Helpers ============

    /// @dev Helper to create a standard Polymarket mirror market from user1
    function _createDefaultPolymarketMirror() internal returns (uint256 marketId, bytes32 mirrorKey) {
        string memory externalId = "polymarket-btc-100k";
        ExternalMarketMirror.MarketSource source = ExternalMarketMirror.MarketSource.POLYMARKET;
        string memory question = "Will BTC reach 100k by end of year?";
        uint256 externalYesPrice = 6500; // 65% YES
        uint256 endTime = block.timestamp + 30 days;

        mirrorKey = mirror.getMirrorKey(source, externalId);

        vm.startPrank(user1);
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);
        marketId = mirror.createMirrorMarket(
            externalId,
            source,
            question,
            externalYesPrice,
            endTime,
            MIRROR_LIQUIDITY
        );
        vm.stopPrank();
    }

    /// @dev Helper to create a Kalshi mirror market from user1
    function _createDefaultKalshiMirror() internal returns (uint256 marketId, bytes32 mirrorKey) {
        string memory externalId = "kalshi-fed-rate-cut";
        ExternalMarketMirror.MarketSource source = ExternalMarketMirror.MarketSource.KALSHI;
        string memory question = "Will the Fed cut rates in March?";
        uint256 externalYesPrice = 4200; // 42% YES
        uint256 endTime = block.timestamp + 14 days;

        mirrorKey = mirror.getMirrorKey(source, externalId);

        vm.startPrank(user1);
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);
        marketId = mirror.createMirrorMarket(
            externalId,
            source,
            question,
            externalYesPrice,
            endTime,
            MIRROR_LIQUIDITY
        );
        vm.stopPrank();
    }

    // ============ 1. testDeployment ============

    function testDeployment() public view {
        // Immutable state set by constructor
        assertEq(address(mirror.crwnToken()), address(crownToken));
        assertEq(address(mirror.predictionMarket()), address(predictionMarket));
        assertEq(mirror.oracleAddress(), oracle);

        // Initial counters should be zero
        assertEq(mirror.totalMirrors(), 0);
        assertEq(mirror.totalMirrorVolume(), 0);

        // Public constants
        assertEq(mirror.MIN_LIQUIDITY(), 0.1 ether);
        assertEq(mirror.PRICE_SYNC_THRESHOLD(), 500);
        assertEq(mirror.PRICE_VARIANCE_BPS(), 200);
        assertEq(mirror.DEFAULT_MIRROR_FEE(), 100);
    }

    function testDeploymentRevertsOnZeroCrwnToken() public {
        vm.expectRevert(ExternalMarketMirror.ExternalMarketMirror__ZeroAddress.selector);
        new ExternalMarketMirror(address(0), address(predictionMarket), oracle);
    }

    function testDeploymentRevertsOnZeroPredictionMarket() public {
        vm.expectRevert(ExternalMarketMirror.ExternalMarketMirror__ZeroAddress.selector);
        new ExternalMarketMirror(address(crownToken), address(0), oracle);
    }

    function testDeploymentOwnerIsDeployer() public view {
        assertEq(mirror.owner(), owner);
    }

    // ============ 2. testBlockBasedRandomness ============

    function testBlockBasedRandomness() public {
        // The _getRandomness() function is private, but its effect is observable
        // through the adjustedPrice of created mirror markets.
        // Creating mirrors at different block heights should produce different
        // adjusted prices due to block-based entropy (blockhash, timestamp).

        uint256[] memory adjustedPrices = new uint256[](3);

        // -- Mirror 1 at block 100, timestamp 1000 --
        vm.roll(100);
        vm.warp(1000);

        vm.startPrank(user1);
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);
        mirror.createMirrorMarket(
            "rand-market-1",
            ExternalMarketMirror.MarketSource.POLYMARKET,
            "Random test 1?",
            5000,  // 50% YES
            block.timestamp + 30 days,
            MIRROR_LIQUIDITY
        );
        vm.stopPrank();

        bytes32 key1 = mirror.getMirrorKey(ExternalMarketMirror.MarketSource.POLYMARKET, "rand-market-1");
        ExternalMarketMirror.MirrorMarket memory m1 = mirror.getMirrorMarket(key1);
        adjustedPrices[0] = m1.externalLink.lastSyncPrice;

        // -- Mirror 2 at block 200, timestamp 2000 --
        vm.roll(200);
        vm.warp(2000);

        vm.startPrank(user1);
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);
        mirror.createMirrorMarket(
            "rand-market-2",
            ExternalMarketMirror.MarketSource.POLYMARKET,
            "Random test 2?",
            5000,
            block.timestamp + 30 days,
            MIRROR_LIQUIDITY
        );
        vm.stopPrank();

        bytes32 key2 = mirror.getMirrorKey(ExternalMarketMirror.MarketSource.POLYMARKET, "rand-market-2");
        ExternalMarketMirror.MirrorMarket memory m2 = mirror.getMirrorMarket(key2);
        adjustedPrices[1] = m2.externalLink.lastSyncPrice;

        // -- Mirror 3 at block 500, timestamp 9999 --
        vm.roll(500);
        vm.warp(9999);

        vm.startPrank(user1);
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);
        mirror.createMirrorMarket(
            "rand-market-3",
            ExternalMarketMirror.MarketSource.POLYMARKET,
            "Random test 3?",
            5000,
            block.timestamp + 30 days,
            MIRROR_LIQUIDITY
        );
        vm.stopPrank();

        bytes32 key3 = mirror.getMirrorKey(ExternalMarketMirror.MarketSource.POLYMARKET, "rand-market-3");
        ExternalMarketMirror.MirrorMarket memory m3 = mirror.getMirrorMarket(key3);
        adjustedPrices[2] = m3.externalLink.lastSyncPrice;

        // All adjusted prices must stay within the PRICE_VARIANCE_BPS range
        // externalYesPrice = 5000, variance = +/- 200 bps, clamped to [100, 9900]
        for (uint256 i = 0; i < 3; i++) {
            assertGe(adjustedPrices[i], 100, "adjusted price below minimum clamp");
            assertLe(adjustedPrices[i], 9900, "adjusted price above maximum clamp");
            // Within +/- 200 of 5000 (variance range)
            assertGe(adjustedPrices[i], 4800, "price drifted below variance band");
            assertLe(adjustedPrices[i], 5200, "price drifted above variance band");
        }

        // At least two of the three should differ (block-based randomness should
        // produce different values across different blocks). This is a statistical
        // check: with three samples from a 400-wide range it is virtually certain
        // that not all three are identical.
        bool allSame = (adjustedPrices[0] == adjustedPrices[1]) && (adjustedPrices[1] == adjustedPrices[2]);
        assertTrue(!allSame, "all three adjusted prices identical -- randomness not varying across blocks");
    }

    function testBlockBasedRandomnessClampLowPrice() public {
        // When external price is very low and variance pushes it below 100,
        // the contract clamps to 100.
        vm.roll(100);
        vm.warp(1000);

        vm.startPrank(user1);
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);
        mirror.createMirrorMarket(
            "low-price-market",
            ExternalMarketMirror.MarketSource.POLYMARKET,
            "Low price clamp test?",
            150, // very low -- variance could push below 100
            block.timestamp + 30 days,
            MIRROR_LIQUIDITY
        );
        vm.stopPrank();

        bytes32 key = mirror.getMirrorKey(ExternalMarketMirror.MarketSource.POLYMARKET, "low-price-market");
        ExternalMarketMirror.MirrorMarket memory m = mirror.getMirrorMarket(key);
        assertGe(m.externalLink.lastSyncPrice, 100, "price below minimum clamp of 100");
    }

    function testBlockBasedRandomnessClampHighPrice() public {
        // When external price is very high and variance pushes above 9900,
        // the contract clamps to 9900.
        vm.roll(100);
        vm.warp(1000);

        vm.startPrank(user1);
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);
        mirror.createMirrorMarket(
            "high-price-market",
            ExternalMarketMirror.MarketSource.POLYMARKET,
            "High price clamp test?",
            9850, // very high -- variance could push above 9900
            block.timestamp + 30 days,
            MIRROR_LIQUIDITY
        );
        vm.stopPrank();

        bytes32 key = mirror.getMirrorKey(ExternalMarketMirror.MarketSource.POLYMARKET, "high-price-market");
        ExternalMarketMirror.MirrorMarket memory m = mirror.getMirrorMarket(key);
        assertLe(m.externalLink.lastSyncPrice, 9900, "price above maximum clamp of 9900");
    }

    // ============ 3. testCreateMirrorMarket ============

    function testCreateMirrorMarket() public {
        (uint256 marketId, bytes32 mirrorKey) = _createDefaultPolymarketMirror();

        // Market ID should be non-zero
        assertGt(marketId, 0, "market id should be > 0");

        // totalMirrors should increment
        assertEq(mirror.totalMirrors(), 1);

        // External-to-market mapping
        assertEq(mirror.externalToMarketId(mirrorKey), marketId);

        // Market-to-mirror reverse mapping
        assertEq(mirror.marketIdToMirror(marketId), mirrorKey);

        // Mirror market struct populated correctly
        ExternalMarketMirror.MirrorMarket memory m = mirror.getMirrorMarket(mirrorKey);
        assertEq(m.marketId, marketId);
        assertEq(m.creator, user1);
        assertEq(m.totalMirrorVolume, 0);
        assertGt(m.createdAt, 0);

        // External link
        assertEq(m.externalLink.externalId, "polymarket-btc-100k");
        assertEq(uint8(m.externalLink.source), uint8(ExternalMarketMirror.MarketSource.POLYMARKET));
        assertTrue(m.externalLink.isActive);
        assertGt(m.externalLink.lastSyncPrice, 0);
        assertGt(m.externalLink.lastSyncTime, 0);
    }

    function testCreateMirrorMarketTransfersLiquidity() public {
        uint256 balanceBefore = crownToken.balanceOf(user1);

        _createDefaultPolymarketMirror();

        uint256 balanceAfter = crownToken.balanceOf(user1);
        assertEq(balanceBefore - balanceAfter, MIRROR_LIQUIDITY, "liquidity not deducted from creator");
    }

    function testCreateMirrorMarketRevertsEmptyExternalId() public {
        vm.startPrank(user1);
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);

        vm.expectRevert(ExternalMarketMirror.ExternalMarketMirror__EmptyExternalId.selector);
        mirror.createMirrorMarket(
            "",
            ExternalMarketMirror.MarketSource.POLYMARKET,
            "Some question?",
            5000,
            block.timestamp + 1 days,
            MIRROR_LIQUIDITY
        );
        vm.stopPrank();
    }

    function testCreateMirrorMarketRevertsInvalidPriceZero() public {
        vm.startPrank(user1);
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);

        vm.expectRevert(ExternalMarketMirror.ExternalMarketMirror__InvalidPrice.selector);
        mirror.createMirrorMarket(
            "ext-1",
            ExternalMarketMirror.MarketSource.POLYMARKET,
            "Question?",
            0, // invalid: price == 0
            block.timestamp + 1 days,
            MIRROR_LIQUIDITY
        );
        vm.stopPrank();
    }

    function testCreateMirrorMarketRevertsInvalidPriceTooHigh() public {
        vm.startPrank(user1);
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);

        vm.expectRevert(ExternalMarketMirror.ExternalMarketMirror__InvalidPrice.selector);
        mirror.createMirrorMarket(
            "ext-2",
            ExternalMarketMirror.MarketSource.POLYMARKET,
            "Question?",
            10000, // invalid: price >= 10000
            block.timestamp + 1 days,
            MIRROR_LIQUIDITY
        );
        vm.stopPrank();
    }

    function testCreateMirrorMarketRevertsInvalidEndTime() public {
        vm.startPrank(user1);
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);

        vm.expectRevert(ExternalMarketMirror.ExternalMarketMirror__InvalidEndTime.selector);
        mirror.createMirrorMarket(
            "ext-3",
            ExternalMarketMirror.MarketSource.POLYMARKET,
            "Question?",
            5000,
            block.timestamp, // invalid: endTime <= block.timestamp
            MIRROR_LIQUIDITY
        );
        vm.stopPrank();
    }

    function testCreateMirrorMarketRevertsInsufficientLiquidity() public {
        uint256 tooLow = 0.05 ether; // below MIN_LIQUIDITY of 0.1 ether

        vm.startPrank(user1);
        crownToken.approve(address(mirror), tooLow);

        vm.expectRevert(ExternalMarketMirror.ExternalMarketMirror__InsufficientLiquidity.selector);
        mirror.createMirrorMarket(
            "ext-4",
            ExternalMarketMirror.MarketSource.POLYMARKET,
            "Question?",
            5000,
            block.timestamp + 1 days,
            tooLow
        );
        vm.stopPrank();
    }

    function testCreateMirrorMarketRevertsDuplicateMirror() public {
        _createDefaultPolymarketMirror();

        // Attempt to mirror the same external market again
        vm.startPrank(user1);
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);

        vm.expectRevert(ExternalMarketMirror.ExternalMarketMirror__AlreadyMirrored.selector);
        mirror.createMirrorMarket(
            "polymarket-btc-100k",
            ExternalMarketMirror.MarketSource.POLYMARKET,
            "Duplicate question?",
            5000,
            block.timestamp + 30 days,
            MIRROR_LIQUIDITY
        );
        vm.stopPrank();
    }

    // ============ 4. testMarketSources ============

    function testMarketSources() public {
        // Create one POLYMARKET and one KALSHI mirror
        (uint256 polyMarketId, bytes32 polyKey) = _createDefaultPolymarketMirror();
        (uint256 kalshiMarketId, bytes32 kalshiKey) = _createDefaultKalshiMirror();

        // Both should have distinct market IDs
        assertTrue(polyMarketId != kalshiMarketId, "market ids should differ");

        // Both should have distinct mirror keys
        assertTrue(polyKey != kalshiKey, "mirror keys should differ for different sources");

        // Verify sources are recorded correctly
        ExternalMarketMirror.MirrorMarket memory polyMirror = mirror.getMirrorMarket(polyKey);
        assertEq(
            uint8(polyMirror.externalLink.source),
            uint8(ExternalMarketMirror.MarketSource.POLYMARKET)
        );

        ExternalMarketMirror.MirrorMarket memory kalshiMirror = mirror.getMirrorMarket(kalshiKey);
        assertEq(
            uint8(kalshiMirror.externalLink.source),
            uint8(ExternalMarketMirror.MarketSource.KALSHI)
        );

        // totalMirrors should reflect both
        assertEq(mirror.totalMirrors(), 2);
    }

    function testMarketSourcesSameExternalIdDifferentSource() public {
        // The same externalId string on different sources should produce
        // distinct mirror keys and be allowed.
        string memory sharedId = "shared-id-123";

        vm.startPrank(user1);

        // Polymarket mirror
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);
        uint256 polyId = mirror.createMirrorMarket(
            sharedId,
            ExternalMarketMirror.MarketSource.POLYMARKET,
            "Poly question?",
            5000,
            block.timestamp + 30 days,
            MIRROR_LIQUIDITY
        );

        // Kalshi mirror with the same externalId
        crownToken.approve(address(mirror), MIRROR_LIQUIDITY);
        uint256 kalshiId = mirror.createMirrorMarket(
            sharedId,
            ExternalMarketMirror.MarketSource.KALSHI,
            "Kalshi question?",
            5000,
            block.timestamp + 30 days,
            MIRROR_LIQUIDITY
        );

        vm.stopPrank();

        assertTrue(polyId != kalshiId, "same externalId on different sources should yield different market ids");

        bytes32 polyKey = mirror.getMirrorKey(ExternalMarketMirror.MarketSource.POLYMARKET, sharedId);
        bytes32 kalshiKey = mirror.getMirrorKey(ExternalMarketMirror.MarketSource.KALSHI, sharedId);
        assertTrue(polyKey != kalshiKey, "mirror keys must differ across sources");
    }

    function testMarketSourcesIsMirroredPerSource() public {
        _createDefaultPolymarketMirror();

        // POLYMARKET version is mirrored
        assertTrue(mirror.isMirrored(ExternalMarketMirror.MarketSource.POLYMARKET, "polymarket-btc-100k"));

        // KALSHI with same ID is NOT mirrored
        assertFalse(mirror.isMirrored(ExternalMarketMirror.MarketSource.KALSHI, "polymarket-btc-100k"));
    }

    // ============ 5. testRevertUnauthorizedAccess ============

    function testRevertUnauthorizedSetOracle() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", unauthorizedUser));
        mirror.setOracle(makeAddr("newOracle"));
    }

    function testRevertUnauthorizedSetAgentContract() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", unauthorizedUser));
        mirror.setAgentContract(makeAddr("newAgent"));
    }

    function testOwnerCanSetOracle() public {
        address newOracle = makeAddr("newOracle");
        mirror.setOracle(newOracle);
        assertEq(mirror.oracleAddress(), newOracle);
    }

    function testOwnerCanSetAgentContract() public {
        address newAgent = makeAddr("newAgent");
        mirror.setAgentContract(newAgent);
        assertEq(address(mirror.aiAgentContract()), newAgent);
    }

    function testSetOracleEmitsEvent() public {
        address newOracle = makeAddr("newOracle");

        vm.expectEmit(true, true, false, false);
        emit OracleUpdated(oracle, newOracle);

        mirror.setOracle(newOracle);
    }

    function testSetAgentContractEmitsEvent() public {
        address newAgent = makeAddr("newAgent");

        vm.expectEmit(true, true, false, false);
        emit AgentContractUpdated(address(0), newAgent);

        mirror.setAgentContract(newAgent);
    }

    function testTradeMirrorRevertsOnInactiveMirror() public {
        // Attempt to trade on a mirror key that does not exist (not active)
        bytes32 fakeMirrorKey = keccak256("nonexistent");

        vm.startPrank(user1);
        crownToken.approve(address(mirror), 10 ether);

        vm.expectRevert(ExternalMarketMirror.ExternalMarketMirror__MirrorNotActive.selector);
        mirror.tradeMirror(fakeMirrorKey, true, 10 ether, 0);
        vm.stopPrank();
    }

    // ============ 6. testGetterFunctions ============

    function testGetterGetMirrorKey() public view {
        bytes32 keyPoly = mirror.getMirrorKey(ExternalMarketMirror.MarketSource.POLYMARKET, "abc");
        bytes32 keyKalshi = mirror.getMirrorKey(ExternalMarketMirror.MarketSource.KALSHI, "abc");

        // Same external ID, different source => different key
        assertTrue(keyPoly != keyKalshi, "keys should differ for different sources");

        // Deterministic: calling again with same args yields same result
        bytes32 keyPoly2 = mirror.getMirrorKey(ExternalMarketMirror.MarketSource.POLYMARKET, "abc");
        assertEq(keyPoly, keyPoly2);
    }

    function testGetterGetMirrorKeyEncoding() public view {
        // Key should match keccak256(abi.encodePacked(uint8(source), externalId))
        bytes32 expected = keccak256(
            abi.encodePacked(uint8(ExternalMarketMirror.MarketSource.POLYMARKET), "my-market")
        );
        bytes32 actual = mirror.getMirrorKey(ExternalMarketMirror.MarketSource.POLYMARKET, "my-market");
        assertEq(actual, expected);
    }

    function testGetterGetMirrorMarket() public {
        (, bytes32 mirrorKey) = _createDefaultPolymarketMirror();

        ExternalMarketMirror.MirrorMarket memory m = mirror.getMirrorMarket(mirrorKey);
        assertGt(m.marketId, 0);
        assertEq(m.creator, user1);
        assertTrue(m.externalLink.isActive);
        assertEq(m.externalLink.externalId, "polymarket-btc-100k");
    }

    function testGetterGetMirrorMarketReturnsEmptyForUnknownKey() public view {
        bytes32 unknownKey = keccak256("does-not-exist");
        ExternalMarketMirror.MirrorMarket memory m = mirror.getMirrorMarket(unknownKey);

        assertEq(m.marketId, 0);
        assertEq(m.creator, address(0));
        assertFalse(m.externalLink.isActive);
    }

    function testGetterGetMirrorKeyByMarketId() public {
        (uint256 marketId, bytes32 mirrorKey) = _createDefaultPolymarketMirror();

        bytes32 retrievedKey = mirror.getMirrorKeyByMarketId(marketId);
        assertEq(retrievedKey, mirrorKey);
    }

    function testGetterGetMirrorKeyByMarketIdReturnsZeroForUnknown() public view {
        bytes32 key = mirror.getMirrorKeyByMarketId(99999);
        assertEq(key, bytes32(0));
    }

    function testGetterIsMirrored() public {
        assertFalse(
            mirror.isMirrored(ExternalMarketMirror.MarketSource.POLYMARKET, "polymarket-btc-100k")
        );

        _createDefaultPolymarketMirror();

        assertTrue(
            mirror.isMirrored(ExternalMarketMirror.MarketSource.POLYMARKET, "polymarket-btc-100k")
        );
    }

    function testGetterExternalToMarketId() public {
        (uint256 marketId, bytes32 mirrorKey) = _createDefaultPolymarketMirror();
        assertEq(mirror.externalToMarketId(mirrorKey), marketId);
    }

    function testGetterTotalMirrors() public {
        assertEq(mirror.totalMirrors(), 0);

        _createDefaultPolymarketMirror();
        assertEq(mirror.totalMirrors(), 1);

        _createDefaultKalshiMirror();
        assertEq(mirror.totalMirrors(), 2);
    }

    function testGetterTotalMirrorVolume() public {
        // Volume starts at zero and is not affected by market creation alone
        assertEq(mirror.totalMirrorVolume(), 0);
        _createDefaultPolymarketMirror();
        assertEq(mirror.totalMirrorVolume(), 0);
    }

    function testGetterGetVerifiedPrediction() public view {
        // Before any prediction is stored, should return default/empty struct
        bytes32 someKey = keccak256("no-prediction");
        ExternalMarketMirror.VerifiedPrediction memory pred = mirror.getVerifiedPrediction(someKey);
        assertFalse(pred.isVerified);
        assertEq(pred.confidence, 0);
        assertEq(bytes(pred.outcome).length, 0);
    }

    function testGetterConstants() public view {
        assertEq(mirror.MIN_LIQUIDITY(), 0.1 ether);
        assertEq(mirror.PRICE_SYNC_THRESHOLD(), 500);
        assertEq(mirror.PRICE_VARIANCE_BPS(), 200);
        assertEq(mirror.DEFAULT_MIRROR_FEE(), 100);
    }
}
