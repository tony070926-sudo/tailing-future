# v0.4.9 Chromium acquisition and extraction — independent review

Date: 2026-09-02
Disposition: **ACCEPT — private non-release acquisition baseline only**
Promotion: **forbidden; R2 remains the conditional champion at 41/100**

## Scope and independence

This review covers the exact Linux Chromium lock, generation-pinned archive
request, bounded streaming publication, dedicated ZIP preflight/extractor,
distribution-tree digest and planned frozen-tree digest. The reviewer did not
implement these source changes and evaluated the final six-file snapshot after
the implementation stopped changing.

It does not cover a Linux browser launch, OpenMM input, sandbox namespace,
complete runtime closure, protected-main artifact, release artifact or
Cloudflare deployment.

## Accepted evidence

- The Playwright CDN discovery address redirects and is retained only as
  provenance. The production request uses the exact GCS object generation
  `1784092744255039`, forbids redirect following, and requires status 200,
  identity encoding and the exact `Content-Length`.
- The response stream and published file descriptor are hashed separately.
  A same-inode mutation inserted between stream writes is detected as
  `published-archive-digest-mismatch` and the known partial is removed.
- The published archive is a canonical, private, single-link mode-0400 file.
  Its identity is `193,282,658` bytes and
  `sha256:ae8736ac28bc69278551500f219fc749575648263c43ec5990749eff43b9fcf8`.
- The dedicated extractor rehashes the archive before and after extraction,
  validates local and central ZIP structures, applies exact count and expansion
  bounds, and rejects ZIP64, data descriptors, encryption,
  links, special files, unknown extras, traversal and path collisions.
- The real archive yields 308 members, 303 regular files, 11 canonical
  directories, 406,847,046 expanded bytes and 193,220,360 compressed payload
  bytes. Independent archive and extracted-file reads yield the same
  distribution-tree digest:
  `sha256:ef61b26dc6a3b390355d5a4c1ea60b9ae4839bb3add815fadb26c626e7fae658`.
- The main executable is 290,614,600 bytes with
  `sha256:0b20b130e7edd9dd51873be867761295fe0cfad490c2b9a64f95bd3cfc08fa71`.
  Exactly nine source members are executable.
- The extractor writes a private staging tree with 0700 directories and
  executable files and 0600 other files. It derives the expected future
  root-owned 0555/0555/0444 tree digest
  `sha256:379be99b95a5b092c51dee46cc3053b08ec513618fe939a945df1f3a9a04adb3`
  but records `verified:false`.
- Production callers cannot override the URL, size, digest or extraction policy
  through the production APIs. Offline fixtures have separate, explicitly
  test-only entry points and audit identity.

## Reproduced checks

- final lock/fetch Vitest: `20/20`;
- final extractor unittest: `13/13`;
- focused ESLint, Python byte compilation and whitespace checks: pass;
- production network acquisition and full real-archive extraction: pass;
- independent 314-entry distribution-tree and planned frozen-tree
  recomputation: pass;
- same-inode stream mutation, final archive mutation, symlink, hardlink,
  unsafe mode, public policy override and same-name cleanup replacement
  negatives: pass.

The final independent review found zero P0 and zero P1 issues for this narrow
baseline.

## Explicit residual boundary

Cleanup uses a checked path lookup followed by unlink/rmdir. It preserves a
static same-name replacement, but it is not an atomic defense against a hostile
same-UID process repeatedly swapping names. The current mutable staging roots
therefore cannot be called adversarially race-proof. The protected path must
move the runtime into a root-owned ancestor, execute under a separate non-root
UID and verify the frozen tree before and after launch.

The acquisition implementation still calls the mutable Node global fetch. Its
audit truthfully records network implementation and network provenance as
unverified. The exact content bytes are established by two hashes and a second
independent extractor hash; trusted transport or a fresh controlled process is
still required for stronger source-provenance wording.

The Playwright digests cover only the two own-package payloads. They exclude a
package-root `node_modules` subtree and do not bind Linux system libraries,
fonts, Node, kernel or graphics drivers. Chromium itself has host shared-library
dependencies outside the ZIP. The frozen-tree digest is a plan until a separate
root-owned non-root preflight verifies it.

Accordingly, all complete-runtime, immutable-snapshot, execution-authenticity,
reproduction, promotion, public-distribution and Cloudflare-distribution
claims remain false. This review authorizes the next private validation stage,
not commit, push, release or deployment.
