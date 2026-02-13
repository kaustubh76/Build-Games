// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import {IERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/**
 * @title ICrownToken - Interface for Crown Token
 * @author Yug Agarwal
 * @dev Interface for the CrownToken contract - an ERC20 token with minting and burning capabilities
 */
interface ICrownToken is IERC20 {
    // Custom Errors
    error CrownToken__InvalidMintAmount();
    error CrownToken__ValueSentAndMintAmountRequestedMismatch();
    error CrownToken__InvalidBurnAmount();
    error CrownToken__NotEnoughBalance();
    error CrownToken__TransferFailed();

    // Events
    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);

    // External Functions
    function mint(uint256 _amount) external payable;

    function burn(uint256 _amount) external;
}
