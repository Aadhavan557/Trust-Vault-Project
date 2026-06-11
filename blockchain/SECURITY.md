# TrustVault Blockchain — Security Recommendations

## 1. Never Store Documents On-Chain

The `DocumentRegistry` contract stores **only SHA-256 hashes** (32 bytes each). Document content, files, images, and personally identifiable information (PII) must **never** be written to the blockchain. On-chain data is public and immutable — once written, it cannot be deleted.

## 2. Private Key Management

| Environment | Recommendation |
|---|---|
| **Development** | Use Hardhat's default accounts (auto-funded, ephemeral) |
| **Staging** | Use a dedicated `.env` file excluded from git |
| **Production** | Use a hardware wallet, AWS KMS, HashiCorp Vault, or a managed key service (e.g. Fireblocks, Alchemy Key Manager) |

**Rules:**
- Never commit private keys to version control
- Never log private keys
- Rotate keys if they are ever exposed
- Use a separate wallet for each environment
- The `.env` file is in `.gitignore` — keep it that way

## 3. Access Control

The smart contract implements a two-tier access model:

- **Owner**: Can add/remove authorized callers, revoke documents, and transfer ownership
- **Authorized Callers**: Can register document hashes

**Best practices:**
- Use a multisig wallet (e.g. Safe/Gnosis Safe) as the contract owner in production
- Minimize the number of authorized callers
- Monitor `AuthorizedCallerAdded`/`Removed` events
- Consider a time-lock for ownership transfers

## 4. Re-Entrancy Protection

The `DocumentRegistry` contract uses the **checks-effects-interactions** pattern:
1. Validate inputs (checks)
2. Update state (effects)
3. Emit events (interactions)

No external calls are made, so re-entrancy is not a risk in the current design. If the contract is extended to make external calls, add OpenZeppelin's `ReentrancyGuard`.

## 5. Gas Management

- **Always estimate gas** before sending transactions (`estimateGas()`)
- **Set gas limits** with a reasonable buffer (the service uses 20%)
- **Monitor gas prices** on mainnet — consider batching registrations during low-gas periods
- **Budget for gas** — each registration costs ~60,000–80,000 gas units

## 6. Event Monitoring & Audit Trail

The contract emits events for every state change:
- `DocumentRegistered` — when a hash is stored
- `DocumentRevoked` — when a hash is revoked
- `AuthorizedCallerAdded` / `AuthorizedCallerRemoved`
- `OwnershipTransferred`

**Recommendations:**
- Set up an event listener or indexer (e.g. The Graph, Alchemy Webhooks) in production
- Store event logs in your audit database
- Alert on unexpected `OwnershipTransferred` or `AuthorizedCallerAdded` events

## 7. Immutability & Append-Only Design

- Registered hashes **cannot be modified** — the contract enforces append-only writes
- Hashes can be **revoked** but not deleted — the original registration remains on-chain forever
- This provides a tamper-proof audit trail

## 8. Network Verification

Before sending transactions:
- Verify the **chain ID** matches your expected network
- Verify the **contract address** matches your deployment
- The `blockchainService.js` checks connectivity via `healthCheck()`

## 9. Rate Limiting

- The Express backend's existing rate limiter applies to blockchain endpoints
- Consider adding additional rate limiting specifically for blockchain registration (to control gas costs)
- The contract's `onlyAuthorized` modifier prevents unauthorized registration even if rate limits are bypassed

## 10. Graceful Degradation

The `blockchainService.js` is designed to fail gracefully:
- If `BLOCKCHAIN_ENABLED` is not `true`, blockchain features are silently disabled
- If the RPC node is unreachable, the service throws caught errors — the main app continues
- The `/health` endpoint reports blockchain connectivity status
- Document upload and management work independently of blockchain availability

## 11. Contract Upgradability

The current contract is **not upgradeable**. If you need to deploy a new version:
1. Deploy the new contract
2. Update `BLOCKCHAIN_CONTRACT_ADDRESS` in `.env`
3. Previously registered hashes remain on the old contract
4. Consider using a proxy pattern (e.g. OpenZeppelin TransparentProxy) if upgradability is required

## 12. Dependency Security

- Keep `ethers.js`, `hardhat`, and `@nomicfoundation/hardhat-toolbox` up to date
- Run `npm audit` regularly in both `backend/` and `backend/blockchain/`
- Pin exact versions in production (`package-lock.json`)
- Consider running Slither or MythX static analysis on the Solidity contract before mainnet deployment
