// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {WarriorsNFT} from "../src/WarriorsNFT.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";

contract WarriorsNFTTest is Test {
    WarriorsNFT public warriorsNFT;
    MockOracle public mockOracle;

    address public dao;
    uint256 public aiPrivateKey;
    address public aiPublicKey;
    address public user1;
    address public gurukul;
    address public arenaFactory;

    function setUp() public {
        dao = makeAddr("dao");
        aiPrivateKey = 0xA11CE;
        aiPublicKey = vm.addr(aiPrivateKey);
        user1 = makeAddr("user1");
        gurukul = makeAddr("gurukul");
        arenaFactory = makeAddr("arenaFactory");

        mockOracle = new MockOracle();
        warriorsNFT = new WarriorsNFT(dao, aiPublicKey, address(mockOracle));

        vm.prank(dao);
        warriorsNFT.setGurukul(gurukul);

        vm.prank(dao);
        warriorsNFT.setArenaFactory(arenaFactory);
    }

    function test_MintNFT() public {
        vm.prank(user1);
        warriorsNFT.mintNft("encryptedURI", keccak256("metadata"));

        assertEq(warriorsNFT.ownerOf(1), user1);
    }

    function test_MintMultipleNFTs() public {
        vm.startPrank(user1);
        warriorsNFT.mintNft("uri1", keccak256("meta1"));
        warriorsNFT.mintNft("uri2", keccak256("meta2"));
        vm.stopPrank();

        assertEq(warriorsNFT.ownerOf(1), user1);
        assertEq(warriorsNFT.ownerOf(2), user1);
    }

    function test_SetGurukulOnlyOnce() public {
        // Already set in setUp, trying again should revert
        vm.prank(dao);
        vm.expectRevert(WarriorsNFT.WarriorsNFT__GurukulAlreadySet.selector);
        warriorsNFT.setGurukul(makeAddr("newGurukul"));
    }

    function test_SetArenaFactoryOnlyOnce() public {
        vm.prank(dao);
        vm.expectRevert(WarriorsNFT.WarriorsNFT__ArenaFactoryAlreadySet.selector);
        warriorsNFT.setArenaFactory(makeAddr("newFactory"));
    }

    function test_IncreaseWinnings() public {
        vm.prank(user1);
        warriorsNFT.mintNft("uri", keccak256("meta"));

        vm.prank(arenaFactory);
        warriorsNFT.increaseWinnings(1, 5 ether);

        assertEq(warriorsNFT.getWinnings(1), 5 ether);
    }

    function test_IncreaseWinningsRevert_NotArenaFactory() public {
        vm.prank(user1);
        warriorsNFT.mintNft("uri", keccak256("meta"));

        vm.prank(user1);
        vm.expectRevert(WarriorsNFT.WarriorsNFT__NotArenaFactory.selector);
        warriorsNFT.increaseWinnings(1, 5 ether);
    }

    function test_GetRankDefault() public {
        vm.prank(user1);
        warriorsNFT.mintNft("uri", keccak256("meta"));

        assertEq(uint8(warriorsNFT.getRanking(1)), 0); // UNRANKED
    }

    function test_DemoteRevert_AlreadyBottom() public {
        vm.prank(user1);
        warriorsNFT.mintNft("uri", keccak256("meta"));

        vm.prank(dao);
        vm.expectRevert(WarriorsNFT.WarriorsNFT__WarriorsAlreadyAtBottomRank.selector);
        warriorsNFT.demoteNFT(1);
    }
}
