# Wallet Service

Future shadow-points wallet and ledger service. This project does not connect real recharge, withdrawal, or on-chain funds by default.

Current scope:

- Internal `SHADOW_POINTS` only.
- Every asset change appends a `ledger_entry`.
- Game services submit `settlement_intent`; wallet-service performs actual posting.
- Settlement is idempotent by `idempotencyKey`.
- No recharge, withdrawal, cash, USDT, TON, or other real-asset API is exposed.
