// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import {ERC1155Holder} from "../lib/openzeppelin-contracts/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IPredictionMarket} from "./Interfaces/IPredictionMarket.sol";
import {IExternalMarketAgent} from "./interfaces/IExternalMarketAgent.sol";

/**
 * @title ExternalMarketMirror
 * @author Warriors AI Arena
 * @notice Creates mirror markets for Polymarket/Kalshi markets on Avalanche
 * @dev Uses block-based randomness for fair pricing and oracle for price sync
 *
 * Key Features:
 * - Mirror external markets (Polymarket, Kalshi) on Avalanche chain
 * - Block-based randomness for initial pricing to prevent front-running
 * - Oracle-based price synchronization with external sources
 * - Instant trading (no VRF delay)
 * - Market resolution based on external outcomes
 *
 * Avalanche Architecture:
 * - All trading happens on Avalanche (fast finality, low gas)
 * - Generic oracle provides AI predictions and verification
 * - External markets provide price discovery
 */
contract ExternalMarketMirror is Ownable, ReentrancyGuard, ERC1155Holder {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============ Errors ============
    error ExternalMarketMirror__EmptyExternalId();
    error ExternalMarketMirror__InvalidPrice();
    error ExternalMarketMirror__InvalidEndTime();
    error ExternalMarketMirror__InsufficientLiquidity();
    error ExternalMarketMirror__AlreadyMirrored();
    error ExternalMarketMirror__MirrorNotActive();
    error ExternalMarketMirror__InvalidOracleSignature();
    error ExternalMarketMirror__ZeroAddress();
    error ExternalMarketMirror__PredictionNotVerified();
    error ExternalMarketMirror__MarketAlreadyResolved();
    error ExternalMarketMirror__AgentNotActive();
    error ExternalMarketMirror__AgentNotAuthorized();
    error ExternalMarketMirror__AgentExternalTradingDisabled();

    // ============ Enums ============

    /// @notice External market source
    enum MarketSource {
        POLYMARKET,
        KALSHI
    }

    // ============ Structs ============

    /// @notice Link to external market
    struct ExternalLink {
        string externalId;
        MarketSource source;
        uint256 lastSyncPrice;      // YES price in bps (0-10000)
        uint256 lastSyncTime;
        bool isActive;
    }

    /// @notice Mirror market data
    struct MirrorMarket {
        uint256 marketId;       // ID in PredictionMarketAMM
        ExternalLink externalLink;
        uint256 totalMirrorVolume;
        uint256 createdAt;
        address creator;
    }

    /// @notice Verified prediction from oracle
    struct VerifiedPrediction {
        string outcome;             // "yes" or "no"
        uint256 confidence;         // 0-100
        bytes32 inputHash;
        bytes32 outputHash;
        address providerAddress;
        bool isVerified;
    }

    // ============ Constants ============
    uint256 public constant MIN_LIQUIDITY = 0.1 ether;    // Minimum 0.1 CRwN (testnet)
    uint256 public constant PRICE_SYNC_THRESHOLD = 500;   // 5% minimum change
    uint256 public constant PRICE_VARIANCE_BPS = 200;       // ±2% variance
    uint256 public constant DEFAULT_MIRROR_FEE = 100;      // 1% default fee (in basis points)

    // ============ State ============
    IERC20 public immutable crwnToken;
    IPredictionMarket public immutable predictionMarket;

    /// @notice Oracle address (oracle verified signer)
    address public oracleAddress;

    /// @notice AI Agent iNFT contract reference
    IExternalMarketAgent public aiAgentContract;

    /// @notice Mirror markets by key
    mapping(bytes32 => MirrorMarket) public mirrorMarkets;

    /// @notice External market ID to internal market ID
    mapping(bytes32 => uint256) public externalToMarketId;

    /// @notice Prediction market ID to mirror key
    mapping(uint256 => bytes32) public marketIdToMirror;

    /// @notice Stored verified predictions
    mapping(bytes32 => VerifiedPrediction) public verifiedPredictions;

    /// @notice Total mirrors created
    uint256 public totalMirrors;

    /// @notice Total volume across all mirrors
    uint256 public totalMirrorVolume;

    // ============ Events ============

    event MirrorMarketRequested(
        uint256 indexed requestId,
        string externalId,
        MarketSource source,
        address indexed creator
    );

    event MirrorMarketCreated(
        bytes32 indexed mirrorKey,
        uint256 marketId,
        string externalId,
        MarketSource source,
        uint256 adjustedPrice
    );

    event MirrorPriceSynced(
        bytes32 indexed mirrorKey,
        uint256 oldPrice,
        uint256 newPrice,
        uint256 timestamp
    );

    event MirrorTradeExecuted(
        bytes32 indexed mirrorKey,
        address indexed trader,
        bool isYes,
        uint256 amount,
        uint256 tokensReceived
    );

    event MirrorResolved(
        bytes32 indexed mirrorKey,
        bool yesWon,
        uint256 timestamp
    );

    event OracleUpdated(
        address indexed oldOracle,
        address indexed newOracle
    );

    event PredictionStored(
        bytes32 indexed mirrorKey,
        string outcome,
        uint256 confidence,
        bool isVerified
    );

    event AgentContractUpdated(
        address indexed oldContract,
        address indexed newContract
    );

    event AgentTradeExecuted(
        uint256 indexed agentId,
        bytes32 indexed mirrorKey,
        bool isYes,
        uint256 amount,
        uint256 sharesOut,
        bytes32 predictionHash
    );

    // ============ Constructor ============

    /**
     * @notice Initialize the External Market Mirror
     * @param _crwnToken CRwN token address
     * @param _predictionMarket Prediction market AMM address
     * @param _oracle oracle verified oracle address
     */
    constructor(
        address _crwnToken,
        address _predictionMarket,
        address _oracle
    ) Ownable(msg.sender) {
        if (_crwnToken == address(0)) revert ExternalMarketMirror__ZeroAddress();
        if (_predictionMarket == address(0)) revert ExternalMarketMirror__ZeroAddress();

        crwnToken = IERC20(_crwnToken);
        predictionMarket = IPredictionMarket(_predictionMarket);
        oracleAddress = _oracle;
    }

    // ============ Mirror Market Creation ============

    /**
     * @notice Create a mirror market for an external Polymarket/Kalshi market
     * @param externalId The market ID on the external platform
     * @param source POLYMARKET or KALSHI
     * @param question The market question
     * @param externalYesPrice Current YES price on external (0-10000 = 0-100%)
     * @param endTime Market end timestamp
     * @param initialLiquidity Initial CRwN liquidity
     * @return marketId The created market ID
     */
    function createMirrorMarket(
        string calldata externalId,
        MarketSource source,
        string calldata question,
        uint256 externalYesPrice,
        uint256 endTime,
        uint256 initialLiquidity
    ) external nonReentrant returns (uint256 marketId) {
        // Validate inputs
        if (bytes(externalId).length == 0) revert ExternalMarketMirror__EmptyExternalId();
        if (externalYesPrice == 0 || externalYesPrice >= 10000) revert ExternalMarketMirror__InvalidPrice();
        if (endTime <= block.timestamp) revert ExternalMarketMirror__InvalidEndTime();
        if (initialLiquidity < MIN_LIQUIDITY) revert ExternalMarketMirror__InsufficientLiquidity();

        // Check not already mirrored
        bytes32 mirrorKey = getMirrorKey(source, externalId);
        if (mirrorMarkets[mirrorKey].externalLink.isActive) revert ExternalMarketMirror__AlreadyMirrored();

        // Transfer liquidity from creator
        crwnToken.transferFrom(msg.sender, address(this), initialLiquidity);

        // Generate randomness for fair initial pricing (Avalanche compatible)
        uint256 randomness = _getRandomness();

        // Apply variance: ±2% to prevent front-running
        int256 variance = int256(randomness % (PRICE_VARIANCE_BPS * 2)) - int256(PRICE_VARIANCE_BPS);
        uint256 adjustedPrice = uint256(int256(externalYesPrice) + variance);

        // Clamp to valid range (1% - 99%)
        if (adjustedPrice < 100) adjustedPrice = 100;
        if (adjustedPrice > 9900) adjustedPrice = 9900;

        // Approve and create market in AMM
        crwnToken.approve(address(predictionMarket), initialLiquidity);
        marketId = predictionMarket.createMarket(question, endTime, initialLiquidity);

        // Store mirror link
        mirrorMarkets[mirrorKey] = MirrorMarket({
            marketId: marketId,
            externalLink: ExternalLink({
                externalId: externalId,
                source: source,
                lastSyncPrice: adjustedPrice,
                lastSyncTime: block.timestamp,
                isActive: true
            }),
            totalMirrorVolume: 0,
            createdAt: block.timestamp,
            creator: msg.sender
        });

        externalToMarketId[mirrorKey] = marketId;
        marketIdToMirror[marketId] = mirrorKey;
        totalMirrors++;

        emit MirrorMarketCreated(mirrorKey, marketId, externalId, source, adjustedPrice);
    }

    // ============ Trading Functions ============

    /**
     * @notice Trade on a mirror market
     * @param mirrorKey The mirror market key
     * @param isYes Whether to buy YES or NO tokens
     * @param amount Amount of CRwN to spend
     * @param minSharesOut Minimum shares to receive (slippage protection)
     * @return sharesOut Number of shares received
     */
    function tradeMirror(
        bytes32 mirrorKey,
        bool isYes,
        uint256 amount,
        uint256 minSharesOut
    ) external nonReentrant returns (uint256 sharesOut) {
        // Transfer tokens from trader
        crwnToken.transferFrom(msg.sender, address(this), amount);

        return _executeTrade(mirrorKey, isYes, amount, minSharesOut, msg.sender);
    }

    /**
     * @notice Internal trade execution
     * @dev Assumes tokens are already transferred to this contract
     */
    function _executeTrade(
        bytes32 mirrorKey,
        bool isYes,
        uint256 amount,
        uint256 minSharesOut,
        address trader
    ) internal returns (uint256 sharesOut) {
        MirrorMarket storage mirror = mirrorMarkets[mirrorKey];
        if (!mirror.externalLink.isActive) revert ExternalMarketMirror__MirrorNotActive();

        crwnToken.approve(address(predictionMarket), amount);

        // Execute trade on AMM
        sharesOut = predictionMarket.buy(
            mirror.marketId,
            isYes,
            amount,
            minSharesOut
        );

        // Update volume tracking
        mirror.totalMirrorVolume += amount;
        totalMirrorVolume += amount;

        emit MirrorTradeExecuted(mirrorKey, trader, isYes, amount, sharesOut);
    }

    /**
     * @notice Trade with verified oracle prediction
     * @param mirrorKey The mirror market key
     * @param amount Amount of CRwN to spend
     * @param prediction The verified prediction
     * @param oracleSignature Signature from oracle oracle proving prediction validity
     */
    function tradeWithVerifiedPrediction(
        bytes32 mirrorKey,
        uint256 amount,
        VerifiedPrediction calldata prediction,
        bytes calldata oracleSignature
    ) external nonReentrant returns (uint256 sharesOut) {
        // Verify the prediction is from oracle
        if (!prediction.isVerified) revert ExternalMarketMirror__PredictionNotVerified();

        // Verify oracle signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            mirrorKey,
            prediction.outcome,
            prediction.confidence,
            prediction.inputHash,
            prediction.outputHash,
            prediction.providerAddress,
            block.chainid
        ));

        if (!_verifySignature(messageHash, oracleSignature)) {
            revert ExternalMarketMirror__InvalidOracleSignature();
        }

        // Store prediction for audit trail
        verifiedPredictions[mirrorKey] = prediction;

        emit PredictionStored(
            mirrorKey,
            prediction.outcome,
            prediction.confidence,
            prediction.isVerified
        );

        // Execute trade based on prediction
        bool isYes = keccak256(bytes(prediction.outcome)) == keccak256(bytes("yes"));

        // Transfer tokens from trader
        crwnToken.transferFrom(msg.sender, address(this), amount);

        return _executeTrade(mirrorKey, isYes, amount, 0, msg.sender);
    }

    // ============ Agent Trading Functions ============

    /**
     * @notice Execute a trade on behalf of an AI agent with verified prediction
     * @dev Requires valid oracle prediction proof and agent authorization
     * @param mirrorKey The mirror market key
     * @param agentId The AI agent iNFT token ID
     * @param amount Amount of CRwN to spend
     * @param prediction The verified oracle prediction
     * @param oracleSignature Oracle signature proving prediction validity
     * @return sharesOut Number of shares received
     */
    function agentTradeMirror(
        bytes32 mirrorKey,
        uint256 agentId,
        uint256 amount,
        VerifiedPrediction calldata prediction,
        bytes calldata oracleSignature
    ) external nonReentrant returns (uint256 sharesOut) {
        // Verify prediction is from oracle
        if (!prediction.isVerified) revert ExternalMarketMirror__PredictionNotVerified();

        // Get market source to determine which platform
        MirrorMarket storage mirror = mirrorMarkets[mirrorKey];
        if (!mirror.externalLink.isActive) revert ExternalMarketMirror__MirrorNotActive();

        bool isPolymarket = mirror.externalLink.source == MarketSource.POLYMARKET;

        // Verify agent exists and is active (if agent contract is set)
        if (address(aiAgentContract) != address(0)) {
            if (!aiAgentContract.isAgentActive(agentId)) {
                revert ExternalMarketMirror__AgentNotActive();
            }

            // Verify agent has external trading enabled for this source
            if (!aiAgentContract.isExternalTradingEnabled(agentId, isPolymarket)) {
                revert ExternalMarketMirror__AgentExternalTradingDisabled();
            }
        }

        // Verify oracle signature includes agent authorization
        bytes32 messageHash = keccak256(abi.encodePacked(
            mirrorKey,
            agentId,
            prediction.outcome,
            prediction.confidence,
            prediction.inputHash,
            prediction.outputHash,
            prediction.providerAddress,
            isPolymarket,
            block.chainid
        ));

        if (!_verifySignature(messageHash, oracleSignature)) {
            revert ExternalMarketMirror__InvalidOracleSignature();
        }

        // Store prediction for audit trail
        verifiedPredictions[mirrorKey] = prediction;

        emit PredictionStored(
            mirrorKey,
            prediction.outcome,
            prediction.confidence,
            prediction.isVerified
        );

        // Execute trade based on prediction
        bool isYes = keccak256(bytes(prediction.outcome)) == keccak256(bytes("yes"));

        // Transfer tokens from caller (agent owner or authorized executor)
        crwnToken.transferFrom(msg.sender, address(this), amount);

        // Execute trade
        sharesOut = _executeTrade(mirrorKey, isYes, amount, 0, msg.sender);

        emit AgentTradeExecuted(
            agentId,
            mirrorKey,
            isYes,
            amount,
            sharesOut,
            prediction.outputHash
        );

        return sharesOut;
    }

    /**
     * @notice Execute a batch of agent trades with verified predictions
     * @dev More gas efficient for multiple trades
     * @param mirrorKeys Array of mirror market keys
     * @param agentId The AI agent iNFT token ID
     * @param amounts Array of CRwN amounts
     * @param predictions Array of verified predictions
     * @param oracleSignatures Array of oracle signatures
     * @return sharesOutArray Array of shares received
     */
    function batchAgentTrade(
        bytes32[] calldata mirrorKeys,
        uint256 agentId,
        uint256[] calldata amounts,
        VerifiedPrediction[] calldata predictions,
        bytes[] calldata oracleSignatures
    ) external nonReentrant returns (uint256[] memory sharesOutArray) {
        require(
            mirrorKeys.length == amounts.length &&
            amounts.length == predictions.length &&
            predictions.length == oracleSignatures.length,
            "Array length mismatch"
        );

        sharesOutArray = new uint256[](mirrorKeys.length);

        // Verify agent is active once
        if (address(aiAgentContract) != address(0)) {
            if (!aiAgentContract.isAgentActive(agentId)) {
                revert ExternalMarketMirror__AgentNotActive();
            }
        }

        for (uint256 i = 0; i < mirrorKeys.length; i++) {
            bytes32 mirrorKey = mirrorKeys[i];
            VerifiedPrediction calldata prediction = predictions[i];

            if (!prediction.isVerified) revert ExternalMarketMirror__PredictionNotVerified();

            MirrorMarket storage mirror = mirrorMarkets[mirrorKey];
            if (!mirror.externalLink.isActive) revert ExternalMarketMirror__MirrorNotActive();

            bool isPolymarket = mirror.externalLink.source == MarketSource.POLYMARKET;

            // Verify agent trading is enabled for this source
            if (address(aiAgentContract) != address(0)) {
                if (!aiAgentContract.isExternalTradingEnabled(agentId, isPolymarket)) {
                    revert ExternalMarketMirror__AgentExternalTradingDisabled();
                }
            }

            // Verify oracle signature
            bytes32 messageHash = keccak256(abi.encodePacked(
                mirrorKey,
                agentId,
                prediction.outcome,
                prediction.confidence,
                prediction.inputHash,
                prediction.outputHash,
                prediction.providerAddress,
                isPolymarket,
                block.chainid
            ));

            if (!_verifySignature(messageHash, oracleSignatures[i])) {
                revert ExternalMarketMirror__InvalidOracleSignature();
            }

            // Store prediction
            verifiedPredictions[mirrorKey] = prediction;

            // Execute trade
            bool isYes = keccak256(bytes(prediction.outcome)) == keccak256(bytes("yes"));
            crwnToken.transferFrom(msg.sender, address(this), amounts[i]);
            sharesOutArray[i] = _executeTrade(mirrorKey, isYes, amounts[i], 0, msg.sender);

            emit AgentTradeExecuted(
                agentId,
                mirrorKey,
                isYes,
                amounts[i],
                sharesOutArray[i],
                prediction.outputHash
            );
        }

        return sharesOutArray;
    }

    // ============ Oracle Functions ============

    /**
     * @notice Sync mirror market price with external source
     * @dev Only callable with valid oracle oracle signature
     * @param mirrorKey The mirror market key
     * @param newExternalPrice New YES price from external (0-10000)
     * @param oracleSignature Signature from oracle oracle
     */
    function syncPrice(
        bytes32 mirrorKey,
        uint256 newExternalPrice,
        bytes calldata oracleSignature
    ) external {
        // Verify oracle oracle signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            mirrorKey,
            newExternalPrice,
            block.chainid,
            "SYNC"
        ));

        if (!_verifySignature(messageHash, oracleSignature)) {
            revert ExternalMarketMirror__InvalidOracleSignature();
        }

        ExternalLink storage link = mirrorMarkets[mirrorKey].externalLink;
        if (!link.isActive) revert ExternalMarketMirror__MirrorNotActive();

        // Only sync if significant price change (>5%)
        uint256 priceDiff = newExternalPrice > link.lastSyncPrice
            ? newExternalPrice - link.lastSyncPrice
            : link.lastSyncPrice - newExternalPrice;

        if ((priceDiff * 10000) / link.lastSyncPrice >= PRICE_SYNC_THRESHOLD) {
            uint256 oldPrice = link.lastSyncPrice;
            link.lastSyncPrice = newExternalPrice;
            link.lastSyncTime = block.timestamp;

            emit MirrorPriceSynced(mirrorKey, oldPrice, newExternalPrice, block.timestamp);
        }
    }

    /**
     * @notice Resolve mirror market based on external outcome
     * @param mirrorKey The mirror market key
     * @param yesWon Whether YES won on the external market
     * @param oracleSignature Signature from oracle oracle
     */
    function resolveMirror(
        bytes32 mirrorKey,
        bool yesWon,
        bytes calldata oracleSignature
    ) external {
        // Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            mirrorKey,
            yesWon,
            "RESOLVE",
            block.chainid
        ));

        if (!_verifySignature(messageHash, oracleSignature)) {
            revert ExternalMarketMirror__InvalidOracleSignature();
        }

        MirrorMarket storage mirror = mirrorMarkets[mirrorKey];
        if (!mirror.externalLink.isActive) revert ExternalMarketMirror__MirrorNotActive();

        // Determine outcome
        IPredictionMarket.Outcome outcome = yesWon
            ? IPredictionMarket.Outcome.YES
            : IPredictionMarket.Outcome.NO;

        // Resolve in AMM (owner permission needed - this contract must be authorized)
        predictionMarket.resolveMarket(mirror.marketId, outcome, "");

        mirror.externalLink.isActive = false;

        emit MirrorResolved(mirrorKey, yesWon, block.timestamp);
    }

    // ============ View Functions ============

    /**
     * @notice Get mirror market key from source and external ID
     * @param source The market source (POLYMARKET or KALSHI)
     * @param externalId The external market ID
     * @return The unique mirror key
     */
    /**
     * @dev Function to generate block-based randomness (Avalanche compatible)
     * @notice Uses block hash, timestamp, sender, and contract state for entropy
     * @return Random uint256 value for fair pricing variance
     */
    function _getRandomness() private view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(
            blockhash(block.number - 1),
            block.timestamp,
            msg.sender,
            address(this).balance
        )));
    }

    function getMirrorKey(
        MarketSource source,
        string memory externalId
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(uint8(source), externalId));
    }

    /**
     * @notice Get mirror market details
     * @param mirrorKey The mirror market key
     * @return The mirror market data
     */
    function getMirrorMarket(bytes32 mirrorKey) external view returns (MirrorMarket memory) {
        return mirrorMarkets[mirrorKey];
    }

    /**
     * @notice Get mirror key from prediction market ID
     * @param marketId The prediction market ID
     * @return The mirror key (bytes32(0) if not a mirror)
     */
    function getMirrorKeyByMarketId(uint256 marketId) external view returns (bytes32) {
        return marketIdToMirror[marketId];
    }

    /**
     * @notice Check if an external market is already mirrored
     * @param source The market source
     * @param externalId The external market ID
     * @return True if mirrored and active
     */
    function isMirrored(
        MarketSource source,
        string calldata externalId
    ) external view returns (bool) {
        bytes32 mirrorKey = getMirrorKey(source, externalId);
        return mirrorMarkets[mirrorKey].externalLink.isActive;
    }

    /**
     * @notice Get verified prediction for a mirror
     * @param mirrorKey The mirror market key
     * @return The stored prediction
     */
    function getVerifiedPrediction(bytes32 mirrorKey) external view returns (VerifiedPrediction memory) {
        return verifiedPredictions[mirrorKey];
    }

    // ============ Admin Functions ============

    /**
     * @notice Update the oracle address
     * @param _oracle New oracle address
     */
    function setOracle(address _oracle) external onlyOwner {
        address oldOracle = oracleAddress;
        oracleAddress = _oracle;
        emit OracleUpdated(oldOracle, _oracle);
    }

    /**
     * @notice Set the AI Agent iNFT contract address
     * @dev Used for cross-chain agent verification
     * @param _agentContract The AIAgentINFT contract address
     */
    function setAgentContract(address _agentContract) external onlyOwner {
        address oldContract = address(aiAgentContract);
        aiAgentContract = IExternalMarketAgent(_agentContract);
        emit AgentContractUpdated(oldContract, _agentContract);
    }

    // ============ Internal Functions ============

    /**
     * @notice Verify an oracle signature
     * @param messageHash The hash of the signed message
     * @param signature The signature to verify
     * @return True if signature is valid and from oracle
     */
    function _verifySignature(
        bytes32 messageHash,
        bytes memory signature
    ) internal view returns (bool) {
        if (oracleAddress == address(0)) return false;

        bytes32 ethHash = messageHash.toEthSignedMessageHash();
        address signer = ethHash.recover(signature);

        return signer == oracleAddress;
    }
}
