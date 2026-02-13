// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {CrownToken} from "../src/CrownToken.sol";
import {CreatorRevenueShare} from "../src/CreatorRevenueShare.sol";

contract CreatorRevenueShareTest is Test {
    CrownToken public crownToken;
    CreatorRevenueShare public revenue;

    address public owner;
    address public creator1;
    address public authorizedContract;

    uint256 constant INITIAL_ETH = 1000 ether;

    function setUp() public {
        owner = address(this);
        creator1 = makeAddr("creator1");
        authorizedContract = makeAddr("authorizedContract");

        crownToken = new CrownToken();
        revenue = new CreatorRevenueShare(address(crownToken));

        // Fund accounts
        vm.deal(creator1, INITIAL_ETH);
        vm.deal(owner, INITIAL_ETH);

        vm.prank(creator1);
        crownToken.mint{value: 500 ether}(500 ether);

        crownToken.mint{value: 500 ether}(500 ether);

        // Authorize a contract to record fees
        revenue.authorizeContract(authorizedContract, true);
    }

    function test_RegisterCreator() public {
        vm.prank(creator1);
        revenue.registerCreator(CreatorRevenueShare.CreatorType.MARKET_CREATOR);
    }

    function test_AuthorizeContract() public {
        address newContract = makeAddr("new");
        revenue.authorizeContract(newContract, true);
    }

    function test_SetMarketCreator() public {
        vm.prank(authorizedContract);
        revenue.setMarketCreator(1, creator1);
    }

    function test_RecordTradeFee() public {
        vm.prank(authorizedContract);
        revenue.setMarketCreator(1, creator1);

        // Deposit fees so there's balance to distribute
        crownToken.approve(address(revenue), 100 ether);
        revenue.depositFees(100 ether);

        vm.prank(authorizedContract);
        revenue.recordTradeFee(1, 1000 ether, 20 ether);
    }

    function test_DepositFees() public {
        crownToken.approve(address(revenue), 50 ether);
        revenue.depositFees(50 ether);
    }

    function test_RecordRevert_Unauthorized() public {
        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized);
        vm.expectRevert(CreatorRevenueShare.CreatorRevenue__Unauthorized.selector);
        revenue.recordTradeFee(1, 1000 ether, 20 ether);
    }

    function test_WithdrawProtocolFees() public {
        // Deposit fees first
        crownToken.approve(address(revenue), 100 ether);
        revenue.depositFees(100 ether);

        // Record a trade to generate protocol fees
        vm.prank(authorizedContract);
        revenue.setMarketCreator(1, creator1);
        vm.prank(authorizedContract);
        revenue.recordTradeFee(1, 1000 ether, 20 ether);

        // Withdraw protocol portion
        address treasury = makeAddr("treasury");
        revenue.withdrawProtocolFees(treasury);
    }
}
