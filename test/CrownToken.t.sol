// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CrownToken} from "../src/CrownToken.sol";

contract CrownTokenTest is Test {
    CrownToken public crownToken;

    address public user1;
    address public user2;

    uint256 constant INITIAL_ETH = 100 ether;

    function setUp() public {
        crownToken = new CrownToken();
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        vm.deal(user1, INITIAL_ETH);
        vm.deal(user2, INITIAL_ETH);
    }

    function test_MintWithAVAX() public {
        vm.prank(user1);
        crownToken.mint{value: 10 ether}(10 ether);

        assertEq(crownToken.balanceOf(user1), 10 ether);
        assertEq(address(crownToken).balance, 10 ether);
    }

    function test_MintRevert_MismatchValue() public {
        vm.prank(user1);
        vm.expectRevert(CrownToken.CrownToken__ValueSentAndMintAmountRequestedMismatch.selector);
        crownToken.mint{value: 5 ether}(10 ether);
    }

    function test_MintRevert_ZeroAmount() public {
        vm.prank(user1);
        vm.expectRevert(CrownToken.CrownToken__InvalidMintAmount.selector);
        crownToken.mint{value: 0}(0);
    }

    function test_BurnForAVAX() public {
        vm.startPrank(user1);
        crownToken.mint{value: 10 ether}(10 ether);

        uint256 balanceBefore = user1.balance;
        crownToken.burn(5 ether);
        uint256 balanceAfter = user1.balance;

        assertEq(crownToken.balanceOf(user1), 5 ether);
        assertEq(balanceAfter - balanceBefore, 5 ether);
        vm.stopPrank();
    }

    function test_BurnRevert_InsufficientBalance() public {
        vm.prank(user1);
        vm.expectRevert(CrownToken.CrownToken__NotEnoughBalance.selector);
        crownToken.burn(1 ether);
    }

    function test_BurnRevert_ZeroAmount() public {
        vm.prank(user1);
        vm.expectRevert(CrownToken.CrownToken__InvalidBurnAmount.selector);
        crownToken.burn(0);
    }

    function test_OneToOneRatio() public {
        vm.startPrank(user1);
        crownToken.mint{value: 50 ether}(50 ether);
        assertEq(crownToken.totalSupply(), 50 ether);
        assertEq(address(crownToken).balance, 50 ether);

        crownToken.burn(50 ether);
        assertEq(crownToken.totalSupply(), 0);
        assertEq(address(crownToken).balance, 0);
        vm.stopPrank();
    }

    function test_MultipleMintAndBurn() public {
        vm.startPrank(user1);
        crownToken.mint{value: 10 ether}(10 ether);
        crownToken.mint{value: 20 ether}(20 ether);
        assertEq(crownToken.balanceOf(user1), 30 ether);

        crownToken.burn(15 ether);
        assertEq(crownToken.balanceOf(user1), 15 ether);
        vm.stopPrank();
    }

    function test_Transfer() public {
        vm.prank(user1);
        crownToken.mint{value: 10 ether}(10 ether);

        vm.prank(user1);
        crownToken.transfer(user2, 3 ether);

        assertEq(crownToken.balanceOf(user1), 7 ether);
        assertEq(crownToken.balanceOf(user2), 3 ether);
    }
}
