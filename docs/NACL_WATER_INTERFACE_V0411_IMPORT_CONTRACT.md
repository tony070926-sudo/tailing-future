# NaCl{100}–Water Semantic Import v0.4.11 Contract

## Status and boundary

`v0.4.11` turns the complete v0.4.10 geometric plan into one deterministic,
cross-language checked solver-input bundle. It is deliberately limited to
transport and semantics: the Python importer uses only the standard library,
and the independent Node verifier binds every emitted byte back to the locked
TypeScript plan.

It does **not** import OpenMM, compile an OpenMM `System`, create a `Context`,
minimize, equilibrate, integrate a time step or emit a trajectory. It does not
satisfy any of the four interface solver-admission gates. Its receipt fixes
`openmmImported`, `systemCompiled`, `contextCreated`, `solverInvoked`,
`minimized`, `equilibrated` and `executionEligible` to `false`; scientific,
reproduction, promotion and public-release claims are also fixed to `false`.

## Locked handoff

The TypeScript exporter materializes exactly one read-only, single-link JSON
file with these identities:

- bytes: `5,053,426`;
- raw SHA-256:
  `473eaab96bb5d90c8ee2f298860aaec624a7124ad7fa99ef362ef9213c7334bd`;
- complete parsed canonical-value SHA-256:
  `183c0cf628a5963064134277d2caea70ad3ecad998d4a576f53f0fd8ac8ac52b`;
- plan digest:
  `f6f271d255de31ab655e62b7539b65e58a4e85994870232b675ef7b40f2fd0b8`.

Publication is create-only. The exporter writes and syncs a private temporary
inode, changes it to mode `0444`, links it into the requested final name only if
that name does not exist, removes the temporary link and syncs the parent
directory. A pre-existing file, directory or symbolic link is never removed or
overwritten.

The Python reader independently requires a normalized absolute path, a real
non-symbolic-link parent, a bounded regular file with one hard link and stable
device, inode, size and timestamps across the read. The strict JSON parser
rejects duplicate keys, BOM, invalid UTF-8, non-finite numbers, unsafe integer
literals, lone surrogates and excessive tree depth or size.

## Independent digest reconstruction

The importer does not call the repository's Python OpenMM contract helper. That
helper intentionally hashes sorted ASCII JSON with a trailing line feed, which
is a different protocol. v0.4.11 independently implements the no-line-feed
`tf.digest-value-no-lf/1` value profile: UTF-8 strings, UTF-16 code-unit key
ordering, finite ECMAScript-style number serialization and SHA-256. The locked
numeric boundary vector is:

```json
[0,0,0,1e-7,1e+21]
```

Its digest is
`42a312db6567a94c25c159743cdfad37637d8d07600423f4b102c5536633cd6d`.
This profile is versioned as the repository's digest protocol; the receipt does
not claim third-party RFC 8785 certification.

Python rebuilds six preimages rather than trusting caller-supplied digests:

1. ordered atom index, ID and xyz coordinate payload;
2. atom identity plus bonds and rigid constraints;
3. pre-system coordinate construction and its independently checked receipt;
4. system payload without `systemDigest`;
5. system-bound coordinate seed without `seedDigest`; and
6. the combined system and coordinate seed without the outer `planDigest`.

All six recomputed digests must equal constants embedded in the importer. A
changed coordinate, identity, charge, source pin, gate, bond or constraint is
rejected even if an attacker recalculates every nested and outer digest.

## Reconstructed semantics

The importer independently checks, rather than merely copying reported counts:

- the ordered `6 × 6 × 4` `Fm-3m` conventional-cell construction;
- 576 Na⁺ and 576 Cl⁻ sites in eight neutral mixed planes;
- five opposite-charge crystal neighbours on each outer plane and six in the
  interior;
- two ordered `12 × 12 × 6` water regions with 864 TIP3P molecules each;
- stable atom, molecule and residue identity and exact phase/site labels;
- 3,456 ordered O–H structural links and 5,184 ordered rigid constraints;
- minimum-image O–H and H–H geometry and the six-direction balance;
- separate formal and candidate model point charges, both globally neutral;
- total coordinate mass `64791.919872000544 Da`;
- the fully periodic `3.38412 × 3.38412 × 6.76824 nm` cell;
- half-open primary-cell bounds;
- global different-molecule minimum distance
  `0.16483354467600186 nm`; and
- ion–water minimum distance `0.26000364891955763 nm`.

Construction labels such as `surfaceRole`, `phase` and water `region` remain
seed metadata. They are not immutable phase assignments for a future periodic
trajectory.

## Normalized bundle

After all checks pass, the importer create-only allocates a new output directory
and writes ten ordered, read-only artifacts through descriptors pinned to the
created directory inodes. The directory is visible during construction; the
receipt written last is the commit marker for a complete bundle:

| ID | Encoding and shape | Meaning |
|---|---|---|
| `cell-vectors` | F64LE `[3,3]` | periodic cell vectors in nm |
| `positions` | F64LE `[6336,3]` | exact ordered xyz positions in nm |
| `masses` | F64LE `[6336]` | particle masses in Da |
| `formal-charges` | F64LE `[6336]` | chemical formal charges in e |
| `model-point-charges` | F64LE `[6336]` | candidate force-field charges in e |
| `species-codes` | U32LE `[6336]` | locked Na⁺/Cl⁻/O/H codebook |
| `structural-bond-indices` | U32LE `[3456,2]` | topology-only O–H links |
| `rigid-constraint-indices` | U32LE `[5184,2]` | constrained pairs |
| `rigid-constraint-targets` | F64LE `[5184]` | target distances in nm |
| `identity-ledger` | canonical JSON `[6336]` | stable atom/residue/site identity |

Every descriptor binds path, dtype, shape, unit, byte count and actual SHA-256;
the closed receipt schema pins the exact input bytes, every artifact digest and
the semantic root rather than accepting arbitrary well-shaped hashes.
An ordered `semanticRoot` binds the descriptor vector. The success receipt is
written last; a failed import leaves no success receipt. The finished bundle
and its two child directories are read-only. The importer checks the exact root
and child inventories both before sealing and immediately before returning; on
failure it removes only files and directories whose inodes it created and still
owns.

The independent Node verifier then validates the closed receipt schema, exact
directory inventory, source digest, six-level digest graph, every descriptor
and file hash, every decoded F64LE/U32LE value, the identity ledger,
`semanticRoot`, stable-evidence digest and receipt self digest. It accepts no
producer-reported scientific result. Before returning, it rechecks the identity,
mode and link count of the plan, receipt, schema, importer source and all ten
artifacts, then rechecks all three directory identities and their closed
inventories.

The full repository test runs this Python importer and Node verifier on the
GitHub Sentinel Ubuntu 24.04 runner as well as locally. A successful Linux run
is cross-platform evidence for this exact source revision; it is not a claim of
bit-exact behavior on untested Python implementations or operating systems.

## Commands

Use fresh absolute paths in a real local directory:

```bash
node scripts/atomistic/openmm/export-nacl-water-interface-plan-v0411.mjs \
  --output /absolute/path/nacl-water-plan.json

python3 scripts/atomistic/openmm/nacl_water_interface_import_v0411.py \
  --plan /absolute/path/nacl-water-plan.json \
  --output /absolute/path/nacl-water-semantic-import

node scripts/atomistic/openmm/verify-nacl-water-interface-import-v0411.mjs \
  --plan /absolute/path/nacl-water-plan.json \
  --bundle /absolute/path/nacl-water-semantic-import
```

## Next admissible step

This bundle is the earliest trustworthy handoff to a future solver adapter, not
permission to execute it. The next iteration must first produce and
independently verify the one-pair low-salt PME control, then the dry mobile slab
and solid/solution/interface potential-domain receipts. Only after all four
versioned prerequisites pass may a fresh process compile a 6,336-particle
OpenMM system and issue a separately bounded, non-promotional preparation
receipt.
