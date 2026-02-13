// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import {ERC721} from "../lib/openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {ECDSA} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "../lib/openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/**
 * @title WarriorsNFT
 * @author Yug Agarwal
 * @notice This is the core contract that mints the charecters' NFTs.
 * @dev A user (charecter maker) must pass the token uri with the charecters' 5 images (normal, attacked, deafened, poisoned and silenced).
 * @dev This user's passed uri should also contain charecters' personality attributes.
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
interface IOracle {
    function verifyProof(bytes calldata proof) external view returns (bool);
}

contract WarriorsNFT is ERC721, ReentrancyGuard {
    error WarriorsNFT__NotArenaFactory();
    error WarriorsNFT__NotDao();
    error WarriorsNFT__WarriorsAlreadyAtTopRank();
    error WarriorsNFT__WarriorsAlreadyAtBottomRank();
    error WarriorsNFT__TraitsAlreadyAssigned();
    error WarriorsNFT__InvalidTokenId();
    error WarriorsNFT__InvalidSignature();
    error WarriorsNFT__GurukulAlreadySet();
    error WarriorsNFT__InvalidGurukulAddress();
    error WarriorsNFT__InvalidTraitsValue();
    error WarriorsNFT__InvalidTokenURI();
    error WarriorsNFT__InvalidMovesNames();
    error WarriorsNFT__InsufficientWinningsForPromotion();
    error WarriorsNFT__NotGurukul();
    error WarriorsNFT__ArenaFactoryAlreadySet();
    error WarriorsNFT__InvalidArenaFactoryAddress();
    error WarriorsNFT__NotOwner();
    error WarriorsNFT__InvalidProof();

    enum Ranking {
        UNRANKED,
        BRONZE,
        SILVER,
        GOLD,
        PLATINUM
    }

    struct Traits {
        // all these can have a maximum value of 100 and with decimal precision of 2
        // so the maximum value of each trait can be 10000
        uint16 strength;
        uint16 wit;
        uint16 charisma;
        uint16 defence;
        uint16 luck;
    }

    struct Moves {
        string strike; // strength
        string taunt; // charisma + wit
        string dodge; // defence
        string special; // personality + strength
        string recover; // defence + charisma
            // everything it also influenced by the luck factor
    }

    uint16 private constant TRAITS_DECIMAL_PRECISION = 2;
    uint256 private constant TOTAL_WINNINGS_NEEDED_FOR_PROMOTION = 1 ether;
    uint256 private s_tokenCounter;
    address private s_gurukul;
    address private s_arenaFactory;
    mapping(uint256 => string) private s_tokenIdToUri;
    mapping(uint256 => Ranking) private s_tokenIdToRanking;
    mapping(uint256 => Traits) private s_tokenIdToTraits;
    mapping(uint256 => Moves) private s_tokenIdToMoves;
    mapping(uint256 => bool) private s_traitsAssigned;
    mapping(uint256 => uint256) private s_WarriorsIdToWinAmounts;
    address private immutable i_dao;
    address private immutable i_AiPublicKey; //  AI Public Key for generating traits and moves

    mapping(uint256 => bytes32) private _metadataHashes;
    mapping(uint256 => string) private _encryptedURIs;
    mapping(uint256 => mapping(address => bytes)) private _authorizations;

    address public s_oracle;

    /**
     * @notice This modifier checks if the caller is either the Gurukul or the DAO.
     * @dev It is used to restrict access to certain functions that can only be called by the Gurukul or DAO.
     */
    modifier onlyArenaFactory() {
        if (msg.sender != s_arenaFactory) {
            revert WarriorsNFT__NotArenaFactory();
        }
        _;
    }

    /**
     * @notice This modifier checks if the caller is the Gurukul.
     * @dev It is used to restrict access to certain functions that can only be called by the Gurukul.
     */
    modifier onlyGurukul() {
        if (msg.sender != s_gurukul) {
            revert WarriorsNFT__NotGurukul();
        }
        _;
    }

    /**
     * @notice This modifier checks if the caller is the DAO.
     * @dev It is used to restrict access to certain functions that can only be called by the DAO.
     */
    modifier onlyDao() {
        if (msg.sender != i_dao) {
            revert WarriorsNFT__NotDao();
        }
        _;
    }

    /**
     * @notice This constructor initializes the WarriorsNFT collection contract.
     * @param _dao The address of the DAO.
     * @param _AiPublicKey The public key of the  Ai or the Game Master(backend) that will generate the traits or signing the data
     */
    constructor(address _dao, address _AiPublicKey, address _oracle) ERC721("Warriors", "WAR") {
        s_tokenCounter = 1; // Start token IDs from 1
        i_dao = _dao;
        i_AiPublicKey = _AiPublicKey;
        s_oracle = _oracle;
    }

    event WarriorsNFTMinted(address indexed owner, uint256 indexed tokenId, string tokenURI);
    event WarriorsPromoted(uint256 indexed tokenId, Ranking newRanking);
    event WarriorsDemoted(uint256 indexed tokenId, Ranking newRanking);
    event WarriorsTraitsAndMovesAssigned(uint256 indexed tokenId);
    event WarriorsTraitsUpdated(uint256 indexed tokenId);
    event WarriorsNFT__GurukulSet(address indexed gurukul);

    event MetadataUpdated(uint256 indexed tokenId, bytes32 newHash);
    event UsageAuthorized(uint256 indexed tokenId, address indexed executor);

    /**
     * @param _gurukul  The address of the Gurukul contract that will train the WarriorsNFTs.
     * @notice This function should be called only once and that too just after the deployment of the WarriorsNFT contract before any other function
     */
    function setGurukul(address _gurukul) external {
        if (s_gurukul != address(0)) {
            revert WarriorsNFT__GurukulAlreadySet();
        }
        if (_gurukul == address(0)) {
            revert WarriorsNFT__InvalidGurukulAddress();
        }

        s_gurukul = _gurukul;

        emit WarriorsNFT__GurukulSet(_gurukul);
    }

    /**
     *
     * @param _arenaFactory The address of the ArenaFactory contract that will manage the battles and promotions of the WarriorsNFTs.
     */
    function setArenaFactory(address _arenaFactory) external {
        if (s_arenaFactory != address(0)) {
            revert WarriorsNFT__ArenaFactoryAlreadySet();
        }
        if (_arenaFactory == address(0)) {
            revert WarriorsNFT__InvalidArenaFactoryAddress();
        }

        s_arenaFactory = _arenaFactory;
    }

    /**
     *
     * _tokenURI The URI of the NFT to be minted, which should contain the charecter's images and personality attributes.
     * @param encryptedURI The encrypted URI of the NFT to be stored using decentralized storage
     * @param metadataHash The hash of the metadata of the NFT
     */
    function mintNft(
        /*string memory _tokenURI,*/
        string calldata encryptedURI,
        bytes32 metadataHash
    ) public {
        if (bytes(encryptedURI).length == 0) {
            revert WarriorsNFT__InvalidTokenURI();
        }

        // s_tokenIdToUri[s_tokenCounter] = _tokenURI;
        _safeMint(msg.sender, s_tokenCounter);
        s_tokenIdToRanking[s_tokenCounter] = Ranking.UNRANKED;

        _encryptedURIs[s_tokenCounter] = encryptedURI;
        _metadataHashes[s_tokenCounter] = metadataHash;

        s_tokenCounter++;

        emit WarriorsNFTMinted(msg.sender, s_tokenCounter - 1, encryptedURI);
    }

    /**
     *
     * @param from The address of the sender
     * @param to The address of the receiver
     * @param tokenId The token id of the NFT
     * @param sealedKey The sealed key of the NFT
     * @param proof The proof of the NFT -- could be anything, it's just a way, this is to hande encryption of the metadata that can be implemented in the future
     */
    function transfer(address from, address to, uint256 tokenId, bytes calldata sealedKey, bytes calldata proof)
        external
        nonReentrant
    {
        if (ownerOf(tokenId) != from) {
            revert WarriorsNFT__NotOwner();
        }
        if (!IOracle(s_oracle).verifyProof(proof)) {
            revert WarriorsNFT__InvalidProof();
        }

        // Update metadata access for new owner
        _updateMetadataAccess(tokenId, to, sealedKey, proof);

        // Transfer token ownership
        _transfer(from, to, tokenId);

        emit MetadataUpdated(tokenId, keccak256(sealedKey));
    }

    /**
     * @param _tokenId The ID of the NFT for which traits and moves are being assigned.
     * @param _strength The strength trait value (0-100).
     * @param _wit The wit trait value (0-100).
     * @param _charisma The charisma trait value (0-100).
     * @param _defence The defence trait value (0-100).
     * @param _luck The luck trait value (0-100).
     * @param _strike The strike move name string.
     * @param _taunt The taunt move name string.
     * @param _dodge The dodge move name string.
     * @param _special The special move name string.
     * @param _recover The recover move name string.
     * @param _signedData The signed data from the  AI.
     */
    function assignTraitsAndMoves(
        uint16 _tokenId,
        uint16 _strength,
        uint16 _wit,
        uint16 _charisma,
        uint16 _defence,
        uint16 _luck,
        string memory _strike,
        string memory _taunt,
        string memory _dodge,
        string memory _special,
        string memory _recover,
        bytes memory _signedData
    ) public {
        if (s_traitsAssigned[_tokenId]) {
            revert WarriorsNFT__TraitsAlreadyAssigned();
        }
        if (_tokenId >= s_tokenCounter) {
            revert WarriorsNFT__InvalidTokenId();
        }
        if (_strength > 10000 || _wit > 10000 || _charisma > 10000 || _defence > 10000 || _luck > 10000) {
            revert WarriorsNFT__InvalidTraitsValue();
        }
        if (
            bytes(_strike).length == 0 || bytes(_taunt).length == 0 || bytes(_dodge).length == 0
                || bytes(_special).length == 0 || bytes(_recover).length == 0
        ) {
            revert WarriorsNFT__InvalidMovesNames();
        }
        if (_strength == 0 || _wit == 0 || _charisma == 0 || _defence == 0 || _luck == 0) {
            revert WarriorsNFT__InvalidTraitsValue();
        }

        bytes32 dataHash = keccak256(
            abi.encodePacked(
                _tokenId, _strength, _wit, _charisma, _defence, _luck, _strike, _taunt, _dodge, _special, _recover
            )
        );
        bytes32 ethSignedMessage = MessageHashUtils.toEthSignedMessageHash(dataHash);
        address recovered = ECDSA.recover(ethSignedMessage, _signedData);

        if (recovered != i_AiPublicKey) {
            revert WarriorsNFT__InvalidSignature();
        }

        s_tokenIdToTraits[_tokenId] =
            Traits({strength: _strength, wit: _wit, charisma: _charisma, defence: _defence, luck: _luck});
        s_tokenIdToMoves[_tokenId] =
            Moves({strike: _strike, taunt: _taunt, dodge: _dodge, special: _special, recover: _recover});
        s_traitsAssigned[_tokenId] = true;
        emit WarriorsTraitsAndMovesAssigned(_tokenId);
    }

    /**
     * @notice This function updates the traits of an existing NFT.
     * @param _tokenId The ID of the NFT whose traits are being updated.
     * @param _strength The new strength trait value (0-10000).
     * @param _wit The new wit trait value (0-10000).
     * @param _charisma The new charisma trait value (0-10000).
     * @param _defence The new defence trait value (0-10000).
     * @param _luck The new luck trait value (0-10000).
     */
    function updateTraits(
        uint256 _tokenId,
        uint16 _strength,
        uint16 _wit,
        uint16 _charisma,
        uint16 _defence,
        uint16 _luck
    ) external onlyGurukul {
        if (_tokenId >= s_tokenCounter) {
            revert WarriorsNFT__InvalidTokenId();
        }
        if (_strength > 10000 || _wit > 10000 || _charisma > 10000 || _defence > 10000 || _luck > 10000) {
            revert WarriorsNFT__InvalidTraitsValue();
        }
        s_tokenIdToTraits[_tokenId] =
            Traits({strength: _strength, wit: _wit, charisma: _charisma, defence: _defence, luck: _luck});

        emit WarriorsTraitsUpdated(_tokenId);
    }

    /**
     * @notice This function increases the winnings of a Warriors NFT.
     * @param _tokenId The ID of the NFT whose winnings are being increased.
     * @param _amount The amount by which to increase the winnings.
     * @dev Only callable by the ArenaFactory.
     */
    function increaseWinnings(uint256 _tokenId, uint256 _amount) external onlyArenaFactory {
        if (_tokenId >= s_tokenCounter) {
            revert WarriorsNFT__InvalidTokenId();
        }
        if (_amount == 0) {
            revert WarriorsNFT__InvalidTraitsValue();
        }

        s_WarriorsIdToWinAmounts[_tokenId] += _amount;
    }

    /**
     * @notice This function promotes the NFT to the next rank.
     * @param _tokenId The ID of the NFT to be promoted.
     * @dev Only callable by the Gurukul or DAO.
     */
    function promoteNFT(uint256 _tokenId) public {
        if (s_tokenIdToRanking[_tokenId] == Ranking.PLATINUM) {
            revert WarriorsNFT__WarriorsAlreadyAtTopRank();
        }
        if (
            s_tokenIdToRanking[_tokenId] == Ranking.UNRANKED
                && s_WarriorsIdToWinAmounts[_tokenId] < TOTAL_WINNINGS_NEEDED_FOR_PROMOTION
        ) {
            revert WarriorsNFT__InsufficientWinningsForPromotion();
        }
        if (
            s_tokenIdToRanking[_tokenId] == Ranking.BRONZE
                && s_WarriorsIdToWinAmounts[_tokenId] - TOTAL_WINNINGS_NEEDED_FOR_PROMOTION
                    < TOTAL_WINNINGS_NEEDED_FOR_PROMOTION * 2
        ) {
            revert WarriorsNFT__InsufficientWinningsForPromotion();
        }
        if (
            s_tokenIdToRanking[_tokenId] == Ranking.SILVER
                && s_WarriorsIdToWinAmounts[_tokenId] - TOTAL_WINNINGS_NEEDED_FOR_PROMOTION * 2
                    < TOTAL_WINNINGS_NEEDED_FOR_PROMOTION * 3
        ) {
            revert WarriorsNFT__InsufficientWinningsForPromotion();
        }
        if (
            s_tokenIdToRanking[_tokenId] == Ranking.GOLD
                && s_WarriorsIdToWinAmounts[_tokenId] - TOTAL_WINNINGS_NEEDED_FOR_PROMOTION * 3
                    < TOTAL_WINNINGS_NEEDED_FOR_PROMOTION * 4
        ) {
            revert WarriorsNFT__InsufficientWinningsForPromotion();
        }
        if (_tokenId >= s_tokenCounter) {
            revert WarriorsNFT__InvalidTokenId();
        }

        if (s_tokenIdToRanking[_tokenId] == Ranking.UNRANKED) {
            s_tokenIdToRanking[_tokenId] = Ranking.BRONZE;
        } else if (s_tokenIdToRanking[_tokenId] == Ranking.BRONZE) {
            s_tokenIdToRanking[_tokenId] = Ranking.SILVER;
        } else if (s_tokenIdToRanking[_tokenId] == Ranking.SILVER) {
            s_tokenIdToRanking[_tokenId] = Ranking.GOLD;
        } else if (s_tokenIdToRanking[_tokenId] == Ranking.GOLD) {
            s_tokenIdToRanking[_tokenId] = Ranking.PLATINUM;
        }

        emit WarriorsPromoted(_tokenId, s_tokenIdToRanking[_tokenId]);
    }

    /**
     * @notice This function demotes the NFT to the previous rank.
     * @param _tokenId The ID of the NFT to be demoted.
     * @dev Only callable by the DAO.
     */
    function demoteNFT(uint256 _tokenId) public onlyDao {
        if (s_tokenIdToRanking[_tokenId] == Ranking.UNRANKED) {
            revert WarriorsNFT__WarriorsAlreadyAtBottomRank();
        }
        if (s_tokenIdToRanking[_tokenId] == Ranking.PLATINUM) {
            s_tokenIdToRanking[_tokenId] = Ranking.GOLD;
        } else if (s_tokenIdToRanking[_tokenId] == Ranking.GOLD) {
            s_tokenIdToRanking[_tokenId] = Ranking.SILVER;
        } else if (s_tokenIdToRanking[_tokenId] == Ranking.SILVER) {
            s_tokenIdToRanking[_tokenId] = Ranking.BRONZE;
        } else if (s_tokenIdToRanking[_tokenId] == Ranking.BRONZE) {
            s_tokenIdToRanking[_tokenId] = Ranking.UNRANKED;
        }

        emit WarriorsDemoted(_tokenId, s_tokenIdToRanking[_tokenId]);
    }

    /**
     *
     * @param tokenId The token id of the NFT
     * @param newOwner The new owner of the NFT
     * @param sealedKey The sealed key of the NFT
     * @param proof The proof of the NFT
     */
    function _updateMetadataAccess(uint256 tokenId, address newOwner, bytes calldata sealedKey, bytes calldata proof)
        internal
    {
        // Extract new metadata hash from proof
        bytes32 newHash = bytes32(proof[0:32]);
        _metadataHashes[tokenId] = newHash;

        // Update encrypted URI if provided in proof
        if (proof.length > 64) {
            string memory newURI = string(proof[64:]);
            _encryptedURIs[tokenId] = newURI;
        }
    }

    /* Helper Getter Functions */

    function getRanking(uint256 _tokenId) public view returns (Ranking) {
        return s_tokenIdToRanking[_tokenId];
    }

    function tokenURI(uint256 _tokenId) public view override returns (string memory) {
        return s_tokenIdToUri[_tokenId];
    }

    function getTraits(uint256 _tokenId) public view returns (Traits memory) {
        return s_tokenIdToTraits[_tokenId];
    }

    function getMoves(uint256 _tokenId) public view returns (Moves memory) {
        return s_tokenIdToMoves[_tokenId];
    }

    function getWinnings(uint256 _tokenId) public view returns (uint256) {
        return s_WarriorsIdToWinAmounts[_tokenId];
    }

    function getMetadataHash(uint256 tokenId) external view returns (bytes32) {
        return _metadataHashes[tokenId];
    }

    function getEncryptedURI(uint256 tokenId) external view returns (string memory) {
        return _encryptedURIs[tokenId];
    }

    // Function to make manage WarriorsNFTs section in the warriorsMinter app
    function getNFTsOfAOwner(address _owner) public view returns (uint256[] memory) {
        uint256 balanace = balanceOf(_owner);
        uint256[] memory tokenIds = new uint256[](balanace);
        uint256 index = 0;
        for (uint256 i = 1; i < s_tokenCounter; i++) {
            if (ownerOf(i) == _owner) {
                tokenIds[index] = i;
                index++;
            }
        }
        return tokenIds;
    }
}
