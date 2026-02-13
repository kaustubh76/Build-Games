// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOracle} from "../WarriorsNFT.sol";

contract MockOracle is IOracle {
    function verifyProof(bytes calldata /* proof */) external pure returns (bool) {
        return true;
    }
}