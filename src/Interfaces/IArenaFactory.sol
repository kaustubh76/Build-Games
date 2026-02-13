// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import {IWarriorsNFT} from "./IWarriorsNFT.sol";

/**
 * @title IArenaFactory - Interface for Arena Factory
 * @author Yug Agarwal
 * @dev Interface for the ArenaFactory contract that manages arena creation and operations
 */
interface IArenaFactory {
    // Custom Errors
    error ArenaFactory__NotDAO();
    error ArenaFactory__InvalidAddress();
    error ArenaFactory__InvalidBetAmount();
    error ArenaFactory__InvalidCostToInfluence();
    error ArenaFactory__InvalidCostToDefluence();
    error ArenaFactory__NotArena();

    // Events
    event NewArenaCreated(
        address indexed arenaAddress,
        IWarriorsNFT.Ranking indexed ranking,
        uint256 costToInfluence,
        uint256 costToDefluence,
        uint256 betAmount
    );

    // External Functions
    function makeNewArena(
        uint256 _costToInfluence,
        uint256 _costToDefluence,
        uint256 _betAmount,
        IWarriorsNFT.Ranking _ranking
    ) external returns (address);

    function updateWinnings(uint256 _WarriorsNFTId, uint256 _amount) external;

    // View Functions
    function getArenas() external view returns (address[] memory);

    function getArenaRanking(address _arena) external view returns (IWarriorsNFT.Ranking);

    function isArenaAddress(address _arena) external view returns (bool);

    function getCrownTokenAddress() external view returns (address);

    function getWarriorsNFTCollection() external view returns (address);

    function getArenasOfARanking(IWarriorsNFT.Ranking _ranking) external view returns (address[] memory);
}
