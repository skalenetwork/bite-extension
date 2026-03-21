# Next Steps

## Contracts to deploy

- [ ] Deploy `EntryPoint` v0.6 on the target SKALE chain.
  Verification:
  - `eth_supportedEntryPoints` returns the deployed address
  - bundler accepts UserOps against it

- [ ] Deploy Coinbase Smart Wallet v1.1 factory + implementation for the target chain.
  Notes:
  - current client uses `viem/account-abstraction` `toCoinbaseSmartAccount`
  - if the chain does not already have Safe Singleton Factory, deploy that first
  Verification:
  - passkey-created wallet resolves deterministic address
  - first UserOp can deploy + execute account

- [ ] Decide paymaster strategy.
  Options:
  - no paymaster in v1, user funds smart wallet
  - deploy paymaster later for sponsored gas
  Verification:
  - if no paymaster: funded smart wallet can send UserOps
  - if paymaster: sponsored UserOps simulate + execute

- [ ] Confirm ConfidentialToken / BITE contracts on the target chain.
  Notes:
  - if staying on current sandbox, reuse existing token + BITE infra
  - if moving chains, redeploy token set and update config
  Verification:
  - `setViewerPublicKey`
  - `transfer`
  - encrypted balance fetch/decrypt all work on target chain

## Infra to run

- [ ] Run an ERC-4337 bundler against the target chain.
  Notes:
  - current extension expects `EXTENSION_PUBLIC_BUNDLER_URL`
  - Infinitism bundler is the baseline
  Verification:
  - `eth_supportedEntryPoints`
  - `eth_estimateUserOperationGas`
  - `eth_sendUserOperation`
  - `eth_getUserOperationReceipt`

- [ ] Run a stable execution RPC for the extension + bundler.
  Verification:
  - bundler simulation matches on-chain execution
  - no rate-limit failures during create/register/send flows

- [ ] Add deployment + env management.
  Needed vars:
  - chain RPC URL
  - bundler RPC URL
  - deployed `EntryPoint`
  - Coinbase factory address
  - token addresses
  Verification:
  - build can target sandbox/staging/prod cleanly

- [ ] Add observability for bundler + extension errors.
  Track:
  - UserOp simulation failures
  - passkey creation/auth failures
  - registration/send failures
  Verification:
  - failed create/register/send path emits actionable logs

## Next steps to proceed

- [ ] Wire explicit smart-account chain config into app code.
  Needed:
  - stop relying on RPC fallback as bundler URL
  - store chain + factory metadata centrally
  Verification:
  - extension can switch between environments without code edits

- [ ] Live-test smart-account flows end-to-end.
  Scenarios:
  - create passkey wallet
  - first UserOp deploys wallet
  - register viewer key
  - send confidential token
  - re-open extension and authenticate with passkey
  Verification:
  - all pass on target chain

- [ ] Decide imported-wallet policy.
  Options:
  - keep imported EOA as advanced mode
  - remove import from onboarding, keep only in settings/advanced
  Verification:
  - onboarding copy matches product decision

- [ ] Finish remaining repo cleanup for TS-only policy.
  Remaining notable JS/config surface:
  - `public/webauthn-helper.js`
  - `extension.config.js`
  Verification:
  - repo policy and actual file layout match

- [ ] Revisit unsupported/placeholder paths before release.
  Current gaps:
  - "Add existing viewer key" path is blocked intentionally
  - no paymaster integration yet
  - no live bundler smoke test in CI
  Verification:
  - no dead-end UI paths in release build

- [ ] Add release gates.
  Required:
  - typecheck
  - tests
  - build
  - manual extension smoke test on target chain
  Verification:
  - one release checklist run from clean clone

## Open questions

- [ ] Will v1 require a paymaster, or is user-funded gas acceptable?
- [ ] Is the target chain staying the current BITE sandbox, or moving to a new SKALE deployment?
- [ ] Do we want Coinbase Smart Wallet factory addresses reused if available, or fully self-managed deployment on every target chain?
