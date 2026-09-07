# Release authentication — encrypted profile support v0.2

The release command remains `npm run deploy:cloudflare`. It deploys only the
verified artifact from the first successful protected-main CI run. Authentication
is prepared after all release gates, using a freshly rebuilt, exactly locked
Wrangler 4.127.0. `--check-only` neither loads credentials nor starts Wrangler.

The two supported authentication sources are the existing exact account/token
environment pair and the default Wrangler OAuth profile. An existing
`default.enc` takes precedence over `default.toml`; an invalid encrypted file
blocks release instead of falling back. The wrapper validates the envelope and
file metadata but never decrypts credentials or calls the OS keyring itself.
Only the final Wrangler process receives the internally fixed keyring setting;
caller-supplied Cloudflare authentication controls remain rejected. Wrangler
selects the explicit `default` profile and the fixed Tailing Future account.

The encrypted profile is copied into a private, isolated XDG config directory.
Wrangler accesses its native OS keyring and retains its normal refresh behavior.
HOME, cache and temporary directories remain separate from the user's original
directories, and no user preference or directory-profile binding is copied.
The plaintext source profile, when used, keeps the existing bounded-copy path.

## Refresh and interruption

Before launching Wrangler, the release wrapper creates an exclusive
`.tailing-release-auth` directory beside the source encrypted profile. Within
it, a fresh `session-*` directory holds the sole copied credential file, under
`xdg/.wrangler/config/default.enc`. Directories are private (0700), credentials
are 0600, and the location must be outside the repository and release scratch.
Only its path is printed. Ciphertext, credential digests, tokens and keys are
never printed by the wrapper.

If the child has exited and the credential bytes, file identity and exact
directory contents are unchanged, the wrapper removes only the known file and
empty directories. If credentials refreshed, state is uncertain, or an unknown
entry appeared, the private session is retained. This also covers a failed
deployment after a successful refresh. A killed parent cannot erase it through
the normal release-scratch cleanup. Upstream Wrangler itself uses a non-atomic
file write; this change does not promise recovery from a power loss during that
write.

The original profile is never overwritten. The exclusive directory prevents a
later release from silently reusing that original profile until the retained
session is reconciled. Every OAuth selection checks this guard before choosing
the encrypted or legacy profile, including when the original encrypted file was
removed. An explicitly selected account/API-token pair is independent of that
OAuth profile. The guard coordinates this release tool only; native Wrangler
and other tools do not share the guard, and may independently refresh or replace
the original profile. A retained session is a recovery state, not proof of a
successful deployment or of which concurrent login remains valid.

On a retained-session report, preserve the exact directory and review the
deployment outcome and any concurrent login first. The latest valid profile can
then be explicitly selected through its native XDG config directory, or the
operator can reauthenticate with Wrangler. Do not paste credentials into logs,
copy decrypted tokens, or delete the retained state before resolving it.
There is no automatic credential writeback or guard-removal command.

## Sources and scope

- [Cloudflare Wrangler keyring documentation](https://developers.cloudflare.com/workers/wrangler/commands/general/#storing-oauth-credentials-in-the-os-keychain),
  retrieved 2026-09-07.
- Wrangler 4.127.0, locked by the npm package integrity in `package-lock.json`:
  default encrypted envelope version 1, AES-256-GCM; native keyring selection,
  default-profile resolution and encrypted refresh storage.

This release migration does not alter scientific models, frontend contracts,
evidence scores, data rights, or inference authorization.
