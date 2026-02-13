// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import {IERC721} from "../../lib/openzeppelin-contracts/contracts/token/ERC721/IERC721.sol";

/**
 * @title IWarriorsNFT - Interface for Warriors NFT
 * @author Yug Agarwal
 * @dev Interface for the WarriorsNFT contract that manages warrior character NFTs
 */
interface IWarriorsNFT is IERC721 {
    // Enums
    enum Ranking {
        UNRANKED,
        BRONZE,
        SILVER,
        GOLD,
        PLATINUM
    }

    // Structs
    struct Traits {
        uint16 strength;
        uint16 wit;
        uint16 charisma;
        uint16 defence;
        uint16 luck;
    }

    struct Moves {
        string strike;
        string taunt;
        string dodge;
        string special;
        string recover;
    }

    // Custom Errors
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

    // Events
    event WarriorsNFTMinted(address indexed owner, uint256 indexed tokenId, string tokenURI);
    event WarriorsPromoted(uint256 indexed tokenId, Ranking newRanking);
    event WarriorsDemoted(uint256 indexed tokenId, Ranking newRanking);
    event WarriorsTraitsAndMovesAssigned(uint256 indexed tokenId);
    event WarriorsTraitsUpdated(uint256 indexed tokenId);
    event WarriorsNFT__GurukulSet(address indexed gurukul);
    event MetadataUpdated(uint256 indexed tokenId, bytes32 newHash);
    event UsageAuthorized(uint256 indexed tokenId, address indexed executor);

    // External Functions
    function setGurukul(address _gurukul) external;

    function setArenaFactory(address _arenaFactory) external;

    function mintNft(string calldata encryptedURI, bytes32 metadataHash) external;

    function transfer(address from, address to, uint256 tokenId, bytes calldata sealedKey, bytes calldata proof)
        external;

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
    ) external;

    function updateTraits(
        uint256 _tokenId,
        uint16 _strength,
        uint16 _wit,
        uint16 _charisma,
        uint16 _defence,
        uint16 _luck
    ) external;

    function increaseWinnings(uint256 _tokenId, uint256 _amount) external;

    function promoteNFT(uint256 _tokenId) external;

    function demoteNFT(uint256 _tokenId) external;

    // View Functions
    function getRanking(uint256 _tokenId) external view returns (Ranking);

    function tokenURI(uint256 _tokenId) external view returns (string memory);

    function getTraits(uint256 _tokenId) external view returns (Traits memory);

    function getMoves(uint256 _tokenId) external view returns (Moves memory);

    function getWinnings(uint256 _tokenId) external view returns (uint256);

    function getMetadataHash(uint256 tokenId) external view returns (bytes32);

    function getEncryptedURI(uint256 tokenId) external view returns (string memory);

    function getNFTsOfAOwner(address _owner) external view returns (uint256[] memory);
}
