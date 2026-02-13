// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {AIDebateOracle} from "../src/AIDebateOracle.sol";

contract AIDebateOracleTest is Test {
    CrownToken public crownToken;
    AIDebateOracle public oracle;

    address public owner;
    uint256 public agent1Key;
    address public agent1Signer;
    uint256 public agent2Key;
    address public agent2Signer;
    address public agent1Operator;
    address public agent2Operator;

    function setUp() public {
        owner = address(this);
        agent1Key = 0xA11CE;
        agent1Signer = vm.addr(agent1Key);
        agent2Key = 0xB0B;
        agent2Signer = vm.addr(agent2Key);
        agent1Operator = makeAddr("op1");
        agent2Operator = makeAddr("op2");

        crownToken = new CrownToken();
        oracle = new AIDebateOracle(address(crownToken));

        oracle.registerDebateAgent(1, agent1Operator, agent1Signer, "gpt-4");
        oracle.registerDebateAgent(2, agent2Operator, agent2Signer, "claude-3");
    }

    function test_RegisterDebateAgent() public {
        AIDebateOracle.DebateAgent memory agent = oracle.getDebateAgent(1);
        assertEq(agent.agentId, 1);
        assertEq(agent.operator, agent1Operator);
        assertEq(agent.signingKey, agent1Signer);
        assertTrue(agent.isActive);
    }

    function test_StartDebate() public {
        oracle.startDebate(100, 1);

        uint256 marketId = oracle.debateMarketIds(1);
        uint256 battleId = oracle.debateBattleIds(1);
        assertEq(marketId, 100);
        assertEq(battleId, 1);
    }

    function test_StartDebateRevert_DuplicateMarket() public {
        oracle.startDebate(100, 1);

        vm.expectRevert(AIDebateOracle.AIDebate__DebateAlreadyExists.selector);
        oracle.startDebate(100, 2);
    }

    function test_DebatePhaseIsPrediction() public {
        oracle.startDebate(100, 1);

        AIDebateOracle.DebatePhase phase = oracle.getDebatePhase(1);
        assertEq(uint8(phase), uint8(AIDebateOracle.DebatePhase.PREDICTION));
    }

    function test_SubmitPrediction() public {
        oracle.startDebate(100, 1);

        bytes32 reasoningHash = keccak256("Warrior 1 has better stats");

        bytes32 messageHash = keccak256(abi.encodePacked(
            uint256(1),
            uint256(1),
            uint8(AIDebateOracle.PredictionOutcome.YES),
            uint256(8000),
            reasoningHash
        ));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agent1Key, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        vm.prank(agent1Operator);
        oracle.submitPrediction(
            1, 1,
            AIDebateOracle.PredictionOutcome.YES,
            8000,
            reasoningHash,
            signature
        );
    }

    function test_AdvancePhase() public {
        oracle.startDebate(100, 1);

        // Advance past prediction deadline
        vm.warp(block.timestamp + 11 minutes);

        oracle.advancePhase(1);
    }

    function test_NextDebateIdIncrements() public {
        oracle.startDebate(100, 1);
        oracle.startDebate(200, 2);

        assertEq(oracle.nextDebateId(), 3);
        assertEq(oracle.totalDebates(), 2);
    }
}
