# Repo Instructions

## TypeScript

- Use TypeScript everywhere.
- Use `.tsx` for React components and `.ts` for non-React modules.
- Do not add new `.js` or `.jsx` files.
- When touching existing `.js` or `.jsx` files, prefer migrating them to `.ts` or `.tsx` in the same change when practical.
- Keep full type safety. Avoid `any`; prefer explicit types and `unknown` when needed.

## Wallet UX

- Do not show seed phrases or recovery phrases during onboarding.
- Locally created wallets should feel keychain-backed to the user.
- Keep recovery/export flows out of the main onboarding path; expose them only from settings or advanced flows.
