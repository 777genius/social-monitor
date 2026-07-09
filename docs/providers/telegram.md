# Telegram Provider

Provider key: not bindable in the current runtime.

Telegram has architecture notes in `docs/architecture-memory`, but there is no
active source provider registered in the current ingestion runtime.

## Current Status

- No runtime provider class is registered for Telegram.
- No `providerKey` should be used for production bindings yet.
- No API key, bot token or user account setup should be added to `.env` for
  Telegram until the provider exists behind the normal source-provider contract.

## What Must Exist Before Setup Docs Become Real

Before Telegram can be enabled, add and approve:

- a concrete source provider implementation;
- source catalog registration and config validation;
- credential ownership policy for bot, channel or user access;
- rate-limit and terms evidence;
- tenant/workspace-scoped credential storage;
- fixture certification and live beta evidence;
- rollback behavior for revoked credentials or private channels.

## Related Architecture Notes

- [Telegram implementation note](../architecture-memory/223-source-telegram-implementation-v1.md)

