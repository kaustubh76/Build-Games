// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import {Arena} from "./Arena.sol";
import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {IWarriorsNFT} from "./Interfaces/IWarriorsNFT.sol";

/**
 * @title ArenaFactory - The Arena Maker
 * @author Yug Agarwal
 * @dev DAO can make new arenas for ranks
 *
 *                          .            .                                   .#
 *                        +#####+---+###+#############+-                  -+###.
 *                        +###+++####+##-+++++##+++##++####+-.         -+###+++
 *                        +#########.-#+--+####++###- -########+---+++#####+++
 *                        +#######+#+++--+####+-..-+-.###+++########+-++###++.
 *                       +######.     +#-#####+-.-------+############+++####-
 *                      +####++...     ########-++-        +##########++++++.
 *                     -#######-+.    .########+++          -++######+++-
 *                     #++########--+-+####++++-- . ..    .-#++--+##+####.
 *                    -+++++++++#####---###---.----###+-+########..-+#++##-
 *                    ++###+++++#####-..---.. .+##++++#++#++-+--.   .-++++#
 *                   .###+.  .+#+-+###+ ..    +##+##+#++----...---.  .-+--+.
 *                   ###+---------+####+   -####+-.......    ...--++.  .---.
 *                  -#++++-----#######+-  .-+###+.... .....      .-+##-.  .
 *                  ##+++###++######++-.   .--+---++---........  ...---.  .
 *                 -####+-+#++###++-.        .--.--...-----.......--..... .
 *                 +######+++###+--..---.....  ...---------------.. .. .  .
 *                .-#########+#+++--++--------......----++--.--.  .--+---.
 *                 -+++########++--++++----------------------.--+++--+++--
 *            .######-.-++++###+----------------------..---++--++-+++---..
 *            -##########-------+-----------------------+-++-++----..----+----+#####++--..
 *            -#############+..  ..--..----------.....-+++++++++++++++++##################+.
 *            --+++++#########+-   . ....  ....... -+++++++++++++++++++############-.----+##-
 *            -----....-+#######+-             .. -+++++++++++++++++++++##+######+.       +++.
 *            --------.....---+#####+--......----.+++++++++++++++++++++##+-+++##+.        -++-
 *            -------...   .--++++++---.....-----.+++++++++++++++++++++++. -+++##-        .---
 *            #################+--.....-------.  .+++++++++++++++++++++-       -+-.       .---
 *            +#########++++-.. .......-+--..--++-++++++++++++++++++++-         .-... ....----
 *            -#####++---..   .--       -+++-.  ..+++++++++++++++++++--        .-+-......-+---
 *            +####+---...    -+#-   .  --++++-. .+++++++++++++++++++---        --        -+--
 *            ++++++++++--....-++.--++--.--+++++-.+++++++++++++++++++---. .......         ----
 *           .--++#########++-.--.+++++--++++###+-++++++++++++++++++++----   .-++-        ----
 *            .-+#############+-.++#+-+-++#######-++++++++++++++++++++----   -++++-      ..---
 *           .---+############+.+###++--++#####++-+++++++++++++++++++++-------++++-........-+-
 *            --+-+##########-+######+++++-++++++-++++++++++++++++++++++-----.----.......---+-
 *           .--+---#######..+#######+++++++--+++-+++++++++++++++++++++++-----------------+++-
 *           .++--..-+##-.-########+++++---++ .+-.+++++++++++++++++++++++++++++++++++---+++++-
 *           -+++. ..-..-+#########++-++--..--....+++++++++++++++++++++++++++++++++++++++++++-
 *           -++-......-+++############++++----- .+++++++++++++++++++++++++++++++++++++++++++-
 *           +##-.....---+#######+####+####+--++-.+++++++++++++++++++++++++++++++++++++++++++-
 *          .#+++-...-++######++-+-----..----++##-+++++++++++++++++++++++++++++++++++++++++++-
 *          .+++--------+##----+------+-..----+++-+++++++++++++++++++++++++++++++++++++++++++-
 *           ----.-----+++-+-...------++-----...--+++++++++++++++++++++++++++++++++++++++++++-
 *          .-..-.--.----..--.... ....++--.  ....-+++++++++++++++++++++++++++++++++++++++++++-
 *           -----------.---..--..   ..+.  . ... .+++++++++++++++++++++++++++++++++++++++++++-
 *         .+#+#+---####+-.    .....--...   .    .+++++++++++++++++++++++++++++++++++++++++++-
 *         -+++++#++++++++.    ..-...--.. ..     .+++++++++++++++++++++++++++++++++++++++++++-
 *         ++++++-------++--   . ....--.. . . .. .+++++++++++++++++++++++++-+----------...
 *         -++++--++++.------......-- ...  ..  . .---------------...
 *         -++-+####+++---..-.........
 *           .....
 */
contract ArenaFactory {
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

    modifier onlyArenas() {
        if (!isArena[msg.sender]) {
            revert ArenaFactory__NotArena();
        }
        _;
    }

    /**
     * @param _costToInfluence The cost to influence an arena
     * @param _costToDefluence The cost to defluence an arena
     * @param _crownTokenAddress The address of the Crown token contract
     * @param _AiPublicKey The public key for  AI
     * @param _WarriorsNFTCollection The address of the Warriors NFT collection
     * @param _betAmount The initial bet amount for the arenas
     */
    constructor(
        uint256 _costToInfluence,
        uint256 _costToDefluence,
        address _crownTokenAddress,
        address _AiPublicKey,
        address _WarriorsNFTCollection,
        uint256 _betAmount
    ) {
        if (_crownTokenAddress == address(0)) {
            revert ArenaFactory__InvalidAddress();
        }
        if (_AiPublicKey == address(0)) {
            revert ArenaFactory__InvalidAddress();
        }
        if (_WarriorsNFTCollection == address(0)) {
            revert ArenaFactory__InvalidAddress();
        }
        if (_betAmount == 0) {
            revert ArenaFactory__InvalidBetAmount();
        }
        if (_costToInfluence == 0) {
            revert ArenaFactory__InvalidCostToInfluence();
        }
        if (_costToDefluence == 0) {
            revert ArenaFactory__InvalidCostToDefluence();
        }

        Arena arena1 = new Arena(
            _costToInfluence,
            _costToDefluence,
            _crownTokenAddress,
            _AiPublicKey,
            _WarriorsNFTCollection,
            _betAmount,
            IWarriorsNFT.Ranking.UNRANKED
        );

        Arena arena2 = new Arena(
            _costToInfluence * 2,
            _costToDefluence * 2,
            _crownTokenAddress,
            _AiPublicKey,
            _WarriorsNFTCollection,
            _betAmount * 2,
            IWarriorsNFT.Ranking.BRONZE
        );

        Arena arena3 = new Arena(
            _costToInfluence * 3,
            _costToDefluence * 3,
            _crownTokenAddress,
            _AiPublicKey,
            _WarriorsNFTCollection,
            _betAmount * 3,
            IWarriorsNFT.Ranking.SILVER
        );

        Arena arena4 = new Arena(
            _costToInfluence * 4,
            _costToDefluence * 4,
            _crownTokenAddress,
            _AiPublicKey,
            _WarriorsNFTCollection,
            _betAmount * 4,
            IWarriorsNFT.Ranking.GOLD
        );

        Arena arena5 = new Arena(
            _costToInfluence * 5,
            _costToDefluence * 5,
            _crownTokenAddress,
            _AiPublicKey,
            _WarriorsNFTCollection,
            _betAmount * 5,
            IWarriorsNFT.Ranking.PLATINUM
        );

        arenas.push(address(arena1));
        arenas.push(address(arena2));
        arenas.push(address(arena3));
        arenas.push(address(arena4));
        arenas.push(address(arena5));
        isArena[address(arena1)] = true;
        isArena[address(arena2)] = true;
        isArena[address(arena3)] = true;
        isArena[address(arena4)] = true;
        isArena[address(arena5)] = true;
        arenaRankings[address(arena1)] = IWarriorsNFT.Ranking.UNRANKED;
        arenaRankings[address(arena2)] = IWarriorsNFT.Ranking.BRONZE;
        arenaRankings[address(arena3)] = IWarriorsNFT.Ranking.SILVER;
        arenaRankings[address(arena4)] = IWarriorsNFT.Ranking.GOLD;
        arenaRankings[address(arena5)] = IWarriorsNFT.Ranking.PLATINUM;

        i_crownTokenAddress = _crownTokenAddress;
        i_AiPublicKey = _AiPublicKey;
        i_WarriorsNFTCollection = _WarriorsNFTCollection;
    }

    event NewArenaCreated(
        address indexed arenaAddress,
        IWarriorsNFT.Ranking indexed ranking,
        uint256 costToInfluence,
        uint256 costToDefluence,
        uint256 betAmount
    );

    /**
     * @param _costToInfluence The cost to influence an arena
     * @param _costToDefluence The cost to defluence an arena
     * @param _betAmount The initial bet amount for the arenas
     * @param _ranking The ranking of the arena
     */
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

    /**
     *
     * @param _WarriorsNFTId The ID of the Warriors NFT to update winnings for
     * @param _amount The amount to add to the winnings of the Warriors NFT
     * @dev This function can only be called by arenas to update the winnings of a Warriors NFT that will further help in promotions and leaderboard management.
     */
    function updateWinnings(uint256 _WarriorsNFTId, uint256 _amount) external onlyArenas {
        IWarriorsNFT(i_WarriorsNFTCollection).increaseWinnings(_WarriorsNFTId, _amount);
    }

    /* Helper Getter Functions */

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