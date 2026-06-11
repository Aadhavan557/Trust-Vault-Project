// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  DocumentRegistry
 * @author TrustVault Team
 * @notice On-chain registry for document integrity verification.
 *         Stores only SHA-256 hashes — NEVER document content.
 *
 * @dev    Design principles:
 *         1. Minimal on-chain storage — one `DocumentRecord` per unique hash.
 *         2. Access-controlled writes — only whitelisted callers can register.
 *         3. Free reads — `verifyDocument` is a `view` function (no gas).
 *         4. Append-only — hashes cannot be modified, only revoked.
 *         5. Events for off-chain indexing.
 */
contract DocumentRegistry {
    // ── Types ─────────────────────────────────────────────────

    struct DocumentRecord {
        bytes32  documentHash;    // SHA-256 hash stored as bytes32
        string   documentType;    // e.g. "aadhaar", "pan", "passport"
        string   documentId;      // off-chain reference ID (MongoDB _id)
        address  registeredBy;    // wallet that submitted the hash
        uint256  registeredAt;    // block.timestamp of registration
        bool     exists;          // true once registered
        bool     revoked;         // true if subsequently revoked
        string   revocationReason;
        uint256  revokedAt;       // block.timestamp of revocation
    }

    // ── State ─────────────────────────────────────────────────

    /// @notice Contract deployer / admin
    address public owner;

    /// @notice hash ⇒ on-chain record
    mapping(bytes32 => DocumentRecord) private _records;

    /// @notice address ⇒ authorised to call registerDocument
    mapping(address => bool) public authorizedCallers;

    /// @notice Running count of registered documents
    uint256 public totalDocuments;

    // ── Events ────────────────────────────────────────────────

    event DocumentRegistered(
        bytes32 indexed documentHash,
        string  documentType,
        string  documentId,
        address indexed registeredBy,
        uint256 registeredAt
    );

    event DocumentRevoked(
        bytes32 indexed documentHash,
        string  reason,
        address indexed revokedBy,
        uint256 revokedAt
    );

    event AuthorizedCallerAdded(address indexed caller);
    event AuthorizedCallerRemoved(address indexed caller);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ── Errors ────────────────────────────────────────────────

    error OnlyOwner();
    error OnlyAuthorized();
    error DocumentAlreadyRegistered(bytes32 documentHash);
    error DocumentNotFound(bytes32 documentHash);
    error DocumentAlreadyRevoked(bytes32 documentHash);
    error InvalidHash();

    // ── Modifiers ─────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender] && msg.sender != owner) {
            revert OnlyAuthorized();
        }
        _;
    }

    // ── Constructor ───────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        authorizedCallers[msg.sender] = true;
        emit AuthorizedCallerAdded(msg.sender);
    }

    // ── Write functions ───────────────────────────────────────

    /**
     * @notice Register a document hash on-chain.
     * @param  _documentHash SHA-256 hash of the document (bytes32)
     * @param  _documentType Human-readable type label
     * @param  _documentId   Off-chain identifier (e.g. MongoDB ObjectId string)
     */
    function registerDocument(
        bytes32 _documentHash,
        string calldata _documentType,
        string calldata _documentId
    ) external onlyAuthorized {
        if (_documentHash == bytes32(0)) revert InvalidHash();
        if (_records[_documentHash].exists) {
            revert DocumentAlreadyRegistered(_documentHash);
        }

        _records[_documentHash] = DocumentRecord({
            documentHash:     _documentHash,
            documentType:     _documentType,
            documentId:       _documentId,
            registeredBy:     msg.sender,
            registeredAt:     block.timestamp,
            exists:           true,
            revoked:          false,
            revocationReason: "",
            revokedAt:        0
        });

        unchecked { totalDocuments++; }

        emit DocumentRegistered(
            _documentHash,
            _documentType,
            _documentId,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Revoke a previously registered document hash.
     * @param  _documentHash The hash to revoke
     * @param  _reason       Human-readable reason for revocation
     */
    function revokeDocument(
        bytes32 _documentHash,
        string calldata _reason
    ) external onlyOwner {
        DocumentRecord storage record = _records[_documentHash];
        if (!record.exists)  revert DocumentNotFound(_documentHash);
        if (record.revoked)  revert DocumentAlreadyRevoked(_documentHash);

        record.revoked          = true;
        record.revocationReason = _reason;
        record.revokedAt        = block.timestamp;

        emit DocumentRevoked(
            _documentHash,
            _reason,
            msg.sender,
            block.timestamp
        );
    }

    // ── View functions (free — no gas) ────────────────────────

    /**
     * @notice Verify whether a document hash is registered and valid.
     * @param  _documentHash The SHA-256 hash to look up
     * @return exists        True if the hash has been registered
     * @return registeredAt  Timestamp of registration (0 if not found)
     * @return registeredBy  Address that registered the hash
     * @return revoked       True if the hash has been revoked
     * @return documentType  The document type label
     * @return documentId    The off-chain reference ID
     */
    function verifyDocument(bytes32 _documentHash)
        external
        view
        returns (
            bool    exists,
            uint256 registeredAt,
            address registeredBy,
            bool    revoked,
            string memory documentType,
            string memory documentId
        )
    {
        DocumentRecord storage record = _records[_documentHash];
        return (
            record.exists,
            record.registeredAt,
            record.registeredBy,
            record.revoked,
            record.documentType,
            record.documentId
        );
    }

    /**
     * @notice Get full record details including revocation info.
     * @param  _documentHash The SHA-256 hash to look up
     */
    function getDocumentRecord(bytes32 _documentHash)
        external
        view
        returns (DocumentRecord memory)
    {
        if (!_records[_documentHash].exists) {
            revert DocumentNotFound(_documentHash);
        }
        return _records[_documentHash];
    }

    // ── Access control ────────────────────────────────────────

    function addAuthorizedCaller(address _caller) external onlyOwner {
        authorizedCallers[_caller] = true;
        emit AuthorizedCallerAdded(_caller);
    }

    function removeAuthorizedCaller(address _caller) external onlyOwner {
        authorizedCallers[_caller] = false;
        emit AuthorizedCallerRemoved(_caller);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "New owner cannot be zero address");
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }
}
