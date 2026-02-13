// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {AIAgentRegistry} from "../src/AIAgentRegistry.sol";

contract AIAgentRegistryTest is Test {
    CrownToken public crownToken;
    AIAgentRegistry public registry;

    address public owner;
    address public operator1;
    address public operator2;
    address public follower;

    uint256 constant INITIAL_ETH = 1000 ether;
    uint256 constant MIN_STAKE = 0.1 ether;

    function setUp() public {
        owner = address(this);
        operator1 = makeAddr("operator1");
        operator2 = makeAddr("operator2");
        follower = makeAddr("follower");

        crownToken = new CrownToken();
        registry = new AIAgentRegistry(address(crownToken));

        vm.deal(operator1, INITIAL_ETH);
        vm.deal(operator2, INITIAL_ETH);
        vm.deal(follower, INITIAL_ETH);

        vm.prank(operator1);
        crownToken.mint{value: 500 ether}(500 ether);

        vm.prank(operator2);
        crownToken.mint{value: 500 ether}(500 ether);

        vm.prank(follower);
        crownToken.mint{value: 200 ether}(200 ether);
    }

    function _registerAgent(address operator) internal returns (uint256) {
        vm.startPrank(operator);
        crownToken.approve(address(registry), MIN_STAKE);

        AIAgentRegistry.PersonaTraits memory traits = AIAgentRegistry.PersonaTraits({
            patience: 50,
            conviction: 70,
            contrarian: 30,
            momentum: 60
        });

        registry.registerAgent(
            "TestAgent",
            "A test agent",
            AIAgentRegistry.AgentStrategy.SUPERFORECASTER,
            AIAgentRegistry.RiskProfile.MODERATE,
            AIAgentRegistry.Specialization.BATTLE_OUTCOMES,
            traits,
            MIN_STAKE
        );
        vm.stopPrank();

        return 1;
    }

    function test_RegisterAgent() public {
        uint256 agentId = _registerAgent(operator1);

        AIAgentRegistry.AIAgent memory agent = registry.getAgent(agentId);

        assertEq(agent.id, 1);
        assertEq(agent.operator, operator1);
        assertEq(keccak256(bytes(agent.name)), keccak256(bytes("TestAgent")));
        assertTrue(agent.isActive);
        assertEq(agent.stakedAmount, MIN_STAKE);
    }

    function test_RegisterRevert_InsufficientStake() public {
        vm.startPrank(operator1);
        crownToken.approve(address(registry), 0.05 ether);

        AIAgentRegistry.PersonaTraits memory traits = AIAgentRegistry.PersonaTraits(50, 70, 30, 60);

        vm.expectRevert(AIAgentRegistry.AIAgentRegistry__InvalidStakeAmount.selector);
        registry.registerAgent(
            "TestAgent", "desc",
            AIAgentRegistry.AgentStrategy.SUPERFORECASTER,
            AIAgentRegistry.RiskProfile.MODERATE,
            AIAgentRegistry.Specialization.ALL,
            traits,
            0.05 ether
        );
        vm.stopPrank();
    }

    function test_DeactivateAndReactivate() public {
        _registerAgent(operator1);

        vm.prank(operator1);
        registry.deactivateAgent(1);

        AIAgentRegistry.AIAgent memory agent = registry.getAgent(1);
        assertFalse(agent.isActive);

        vm.prank(operator1);
        registry.reactivateAgent(1);

        agent = registry.getAgent(1);
        assertTrue(agent.isActive);
    }

    function test_AddStake() public {
        _registerAgent(operator1);

        vm.startPrank(operator1);
        crownToken.approve(address(registry), 0.1 ether);
        registry.addStake(1, 0.1 ether);
        vm.stopPrank();

        AIAgentRegistry.AIAgent memory agent = registry.getAgent(1);
        assertEq(agent.stakedAmount, 0.2 ether);
    }

    function test_FollowAgent() public {
        _registerAgent(operator1);

        vm.prank(follower);
        registry.followAgent(1, 10 ether);
    }

    function test_FollowRevert_CannotFollowSelf() public {
        _registerAgent(operator1);

        vm.prank(operator1);
        vm.expectRevert(AIAgentRegistry.AIAgentRegistry__CannotFollowSelf.selector);
        registry.followAgent(1, 10 ether);
    }

    function test_RecordTrade() public {
        _registerAgent(operator1);

        registry.recordTrade(1, 100, true, 50, 1000 ether, 8500);
    }
}
