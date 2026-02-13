// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import {Arena} from "./Arena.sol";
import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {IWarriorsNFT} from "./Interfaces/IWarriorsNFT.sol";

/**
 * @title ArenaFactoryLight - Gas-optimized ArenaFactory for Fuji deployment
 * @dev Same interface as ArenaFactory but deploys arenas lazily via initialize()
 */
contract ArenaFactoryLight {
    error ArenaFactory__NotDAO();
    error ArenaFactory__InvalidAddress();
    error ArenaFactory__InvalidBetAmount();
    error ArenaFactory__InvalidCostToInfluence();
    error ArenaFactory__InvalidCostToDefluence();
    error ArenaFactory__NotArena();

    address[] private arenas;
    mapping(address => bool) private isArena;
    mapping(address => IWarriorsNFT.Ranking) private arenaRankings;
    address private immutable i_crownTokenAddress;
    address private immutable i_AiPublicKey;
    address private immutable i_WarriorsNFTCollection;
    address private immutable i_owner;

    uint256 private s_costToInfluence;
    uint256 private s_costToDefluence;
    uint256 private s_betAmount;

    modifier onlyArenas() {
        if (!isArena[msg.sender]) {
            revert ArenaFactory__NotArena();
        }
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == i_owner, "Not owner");
        _;
    }

    constructor(
        uint256 _costToInfluence,
        uint256 _costToDefluence,
        address _crownTokenAddress,
        address _AiPublicKey,
        address _WarriorsNFTCollection,
        uint256 _betAmount
    ) {
        if (_crownTokenAddress == address(0)) revert ArenaFactory__InvalidAddress();
        if (_AiPublicKey == address(0)) revert ArenaFactory__InvalidAddress();
        if (_WarriorsNFTCollection == address(0)) revert ArenaFactory__InvalidAddress();
        if (_betAmount == 0) revert ArenaFactory__InvalidBetAmount();
        if (_costToInfluence == 0) revert ArenaFactory__InvalidCostToInfluence();
        if (_costToDefluence == 0) revert ArenaFactory__InvalidCostToDefluence();

        i_crownTokenAddress = _crownTokenAddress;
        i_AiPublicKey = _AiPublicKey;
        i_WarriorsNFTCollection = _WarriorsNFTCollection;
        i_owner = msg.sender;
        s_costToInfluence = _costToInfluence;
        s_costToDefluence = _costToDefluence;
        s_betAmount = _betAmount;
    }

    event NewArenaCreated(
        address indexed arenaAddress,
        IWarriorsNFT.Ranking indexed ranking,
        uint256 costToInfluence,
        uint256 costToDefluence,
        uint256 betAmount
    );

    /// @notice Deploy a single arena for a given ranking (called separately for each rank)
    function deployArena(IWarriorsNFT.Ranking _ranking, uint256 _multiplier) external onlyOwner returns (address) {
        Arena arena = new Arena(
            s_costToInfluence * _multiplier,
            s_costToDefluence * _multiplier,
            i_crownTokenAddress,
            i_AiPublicKey,
            i_WarriorsNFTCollection,
            s_betAmount * _multiplier,
            _ranking
        );

        arenas.push(address(arena));
        isArena[address(arena)] = true;
        arenaRankings[address(arena)] = _ranking;

        emit NewArenaCreated(
            address(arena), _ranking,
            s_costToInfluence * _multiplier,
            s_costToDefluence * _multiplier,
            s_betAmount * _multiplier
        );

        return address(arena);
    }

    function makeNewArena(
        uint256 _costToInfluence,
        uint256 _costToDefluence,
        uint256 _betAmount,
        IWarriorsNFT.Ranking _ranking
    ) external returns (address) {
        Arena newArena = new Arena(
            _costToInfluence,
            _costToDefluence,
            i_crownTokenAddress,
            i_AiPublicKey,
            i_WarriorsNFTCollection,
            _betAmount,
            _ranking
        );

        arenas.push(address(newArena));
        isArena[address(newArena)] = true;
        arenaRankings[address(newArena)] = _ranking;

        emit NewArenaCreated(address(newArena), _ranking, _costToInfluence, _costToDefluence, _betAmount);

        return address(newArena);
    }

    function updateWinnings(uint256 _WarriorsNFTId, uint256 _amount) external onlyArenas {
        IWarriorsNFT(i_WarriorsNFTCollection).increaseWinnings(_WarriorsNFTId, _amount);
    }

    function getArenas() external view returns (address[] memory) {
        return arenas;
    }

    function getArenaRanking(address _arena) external view returns (IWarriorsNFT.Ranking) {
        return arenaRankings[_arena];
    }

    function isArenaAddress(address _arena) external view returns (bool) {
        return isArena[_arena];
    }

    function getCrownTokenAddress() external view returns (address) {
        return i_crownTokenAddress;
    }

    function getWarriorsNFTCollection() external view returns (address) {
        return i_WarriorsNFTCollection;
    }

    function arenaCount() external view returns (uint256) {
        return arenas.length;
    }

    function getArenasOfARanking(IWarriorsNFT.Ranking _ranking) external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < arenas.length; i++) {
            if (arenaRankings[arenas[i]] == _ranking) {
                count++;
            }
        }

        address[] memory rankedArenas = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < arenas.length; i++) {
            if (arenaRankings[arenas[i]] == _ranking) {
                rankedArenas[index] = arenas[i];
                index++;
            }
        }

        return rankedArenas;
    }
}
