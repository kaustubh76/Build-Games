// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {PredictionArena} from "../src/PredictionArena.sol";
import {WarriorsNFT} from "../src/WarriorsNFT.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";

contract PredictionArenaTest is Test {
    CrownToken public crownToken;
    PredictionArena public predArena;
    WarriorsNFT public warriorsNFT;
    MockOracle public mockOracle;

    address public owner;
    address public player1;
    address public player2;
    address public bettor;

    uint256 public aiPrivateKey = 0xA11CE;
    address public aiPublicKey;

    uint256 constant INITIAL_ETH = 1000 ether;

    function setUp() public {
        owner = address(this);
        player1 = makeAddr("player1");
        player2 = makeAddr("player2");
        bettor = makeAddr("bettor");
        aiPublicKey = vm.addr(aiPrivateKey);

        crownToken = new CrownToken();
        mockOracle = new MockOracle();
        warriorsNFT = new WarriorsNFT(owner, aiPublicKey, address(mockOracle));

        predArena = new PredictionArena(
            address(crownToken),
            address(warriorsNFT),
            aiPublicKey
        );

        // Fund users
        vm.deal(player1, INITIAL_ETH);
        vm.deal(player2, INITIAL_ETH);
        vm.deal(bettor, INITIAL_ETH);

        vm.prank(player1);
        crownToken.mint{value: 500 ether}(500 ether);

        vm.prank(player2);
        crownToken.mint{value: 500 ether}(500 ether);

        vm.prank(bettor);
        crownToken.mint{value: 100 ether}(100 ether);

        // Mint warrior NFTs
        vm.prank(player1);
        warriorsNFT.mintNft("uri1", keccak256("meta1"));

        vm.prank(player2);
        warriorsNFT.mintNft("uri2", keccak256("meta2"));
    }

    function test_CreateChallenge() public {
        vm.startPrank(player1);
        crownToken.approve(address(predArena), 10 ether);

        predArena.createChallenge(
            1,                          // warriorId
            keccak256("market1"),       // externalMarketKey
            true,                       // sideYes
            10 ether,                   // stakes
            24 hours                    // duration
        );
        vm.stopPrank();
    }

    function test_CancelChallenge() public {
        vm.startPrank(player1);
        crownToken.approve(address(predArena), 10 ether);

        predArena.createChallenge(1, keccak256("market1"), true, 10 ether, 24 hours);
        predArena.cancelChallenge(1);
        vm.stopPrank();
    }

    function test_AcceptChallenge() public {
        // Player 1 creates challenge
        vm.startPrank(player1);
        crownToken.approve(address(predArena), 10 ether);
        predArena.createChallenge(1, keccak256("market1"), true, 10 ether, 24 hours);
        vm.stopPrank();

        // Player 2 accepts
        vm.startPrank(player2);
        crownToken.approve(address(predArena), 10 ether);
        predArena.acceptChallenge(1, 2);
        vm.stopPrank();
    }

    function test_PlaceBet() public {
        // Create and accept challenge
        vm.startPrank(player1);
        crownToken.approve(address(predArena), 10 ether);
        predArena.createChallenge(1, keccak256("market1"), true, 10 ether, 24 hours);
        vm.stopPrank();

        vm.startPrank(player2);
        crownToken.approve(address(predArena), 10 ether);
        predArena.acceptChallenge(1, 2);
        vm.stopPrank();

        // Bettor places bet
        vm.startPrank(bettor);
        crownToken.approve(address(predArena), 1 ether);
        predArena.placeBet(1, true, 1 ether);
        vm.stopPrank();
    }

    function test_CreateChallengeRevert_NotOwner() public {
        vm.startPrank(player2);
        crownToken.approve(address(predArena), 10 ether);

        vm.expectRevert(PredictionArena.PredictionArena__InvalidWarrior.selector);
        predArena.createChallenge(1, keccak256("market1"), true, 10 ether, 24 hours);
        vm.stopPrank();
    }

    function test_AcceptChallengeRevert_CannotSelf() public {
        vm.startPrank(player1);
        crownToken.approve(address(predArena), 20 ether);
        predArena.createChallenge(1, keccak256("market1"), true, 10 ether, 24 hours);

        vm.expectRevert(PredictionArena.PredictionArena__CannotChallengeself.selector);
        predArena.acceptChallenge(1, 1);
        vm.stopPrank();
    }

    function test_SubmitRound() public {
        // Create and accept challenge
        vm.startPrank(player1);
        crownToken.approve(address(predArena), 10 ether);
        predArena.createChallenge(1, keccak256("market1"), true, 10 ether, 24 hours);
        vm.stopPrank();

        vm.startPrank(player2);
        crownToken.approve(address(predArena), 10 ether);
        predArena.acceptChallenge(1, 2);
        vm.stopPrank();

        // Sign round data
        bytes32 w1ArgHash = keccak256("w1 argument");
        bytes32 w2ArgHash = keccak256("w2 argument");

        bytes32 messageHash = keccak256(abi.encodePacked(
            uint256(1),  // battleId
            uint8(1),    // roundNumber
            w1ArgHash,
            w2ArgHash,
            uint8(PredictionArena.DebateMove.STRIKE),
            uint8(PredictionArena.DebateMove.DODGE),
            uint16(600), // w1Score
            uint16(400)  // w2Score
        ));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aiPrivateKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        predArena.submitRound(
            1, 1, w1ArgHash, w2ArgHash,
            PredictionArena.DebateMove.STRIKE,
            PredictionArena.DebateMove.DODGE,
            600, 400, signature
        );
    }
}
