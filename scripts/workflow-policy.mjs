import { createHash } from 'node:crypto';
import { load as parseYaml } from 'js-yaml';
import { FULL_CANDIDATE_PRODUCER_WORKFLOW } from './atomistic/full-candidate-github-evidence-policy.mjs';

export const PINNED_DOCKERFILE_FRONTEND = 'docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e';
export const ATOMISTIC_BOOTSTRAP_WORKFLOW_PATH = '.github/workflows/atomistic-bootstrap.yml';
export const ATOMISTIC_BOOTSTRAP_VERIFY_WORKFLOW_PATH = '.github/workflows/atomistic-bootstrap-verify.yml';
export const OPENMM_TIP3P_PROTECTED_WORKFLOW_PATH = '.github/workflows/openmm-tip3p-protected.yml';
export const OPENMM_TIP3P_PROTECTED_WORKFLOW_SHA256 = '1e709fd989d30908df269ed236af00b7d94f3b77e8945cccdb3f45622bf87810';
export const FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH =
  FULL_CANDIDATE_PRODUCER_WORKFLOW.path;
export const FULL_CANDIDATE_REGISTRATION_WORKFLOW_NAME =
  FULL_CANDIDATE_PRODUCER_WORKFLOW.name;
export const FULL_CANDIDATE_REGISTRATION_WORKFLOW_SIZE_BYTES = 520;
export const FULL_CANDIDATE_REGISTRATION_WORKFLOW_SHA256 =
  'e578459f2c46e77d10f3fd944984daa01f845219921454c3095b9852e4074cc0';
export const ATOMISTIC_BOOTSTRAP_QUARANTINE_PATH = 'evaluation/atomistic/bootstrap-quarantine.json';
export const ATOMISTIC_BOOTSTRAP_QUARANTINE_SHA256 = '65af8aae9d84281899116cca55dd883611a28eae453d0b190c737ec29bcd13a3';
export const ATOMISTIC_BOOTSTRAP_QUARANTINED_RUNNER_DIGEST = 'sha256:2c708fc0220808cc4b2e2f3043623f604793f7bd8a5913472440f91f17a3987c';
export const ATOMISTIC_BOOTSTRAP_SELECTED_RUNNER_DIGEST = 'sha256:d6e83640f15926088c116312c27605570f9e9c8ba4e9a9988ef5bf4d3a974ed4';
export const ATOMISTIC_RUNTIME_SOURCE_REVISION = 'f861b3e30572f1db366554a2e330d5d6c78bdb56';
export const ATOMISTIC_RUNTIME_SOURCE_DATE_EPOCH = 1787977543;
export const ATOMISTIC_SOURCE_MANIFEST_DIGEST = 'sha256:08b1ed2ae239ce5732cf565b5e7bd814727a99ad6e1e1a29aeaa21ea1ed529a1';
export const ATOMISTIC_MATERIALIZATION_DIGEST = 'sha256:345d5e55227bbe873d567f5ea72b88db1f21c1d46e72f078db38e6a455d47721';
export const SENTINEL_EVALUATION_WORKFLOW_PATH = '.github/workflows/evaluate.yml';
export const SENTINEL_EVALUATION_WORKFLOW_SHA256 = '57773b8ff757a5c3401bdaa8878bb43a6386921a7af351f0e5c1a5173e65a5d1';
export const SENTINEL_REPORT_WORKFLOW_PATH = '.github/workflows/sentinel-report.yml';
export const ATOMISTIC_BOOTSTRAP_BASE_IMAGE = 'python:3.12.13-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2';
export const ATOMISTIC_BOOTSTRAP_BASE_AMD64_DIGEST = 'sha256:6e13e65c55e33adf203d77ee371cf8bf5d81bd4902ef07565721f46bf44917af';
export const ATOMISTIC_BOOTSTRAP_NODE_VERSION = '24.16.0';
export const ATOMISTIC_BOOTSTRAP_PYTORCH_INDEX = 'https://download.pytorch.org/whl/cpu';
export const ATOMISTIC_BOOTSTRAP_PYPI_INDEX = 'https://pypi.org/simple';
export const PYTHON_HOSTLIST_SDIST_URL = 'https://files.pythonhosted.org/packages/90/cc/bb6395c3f2b6bb739b1d3fc0e71f94e6a1c2e256df496237cbfd13cd74a6/python_hostlist-2.3.0.tar.gz';
export const PYTHON_HOSTLIST_SDIST_SHA256 = 'e1a0b18e525a5fca573cb9862799f11b3f2bd3ba7aec70c4ecd8b95341bb71ea';
export const PYTHON_HOSTLIST_BUILD_LOCK_SHA256 = 'dffc06ecc2faab2b6e0fe729ac1c16dda524edff76297a06e20b839832e1e120';
export const PYTHON_HOSTLIST_BUILD_SCRIPT_SHA256 = 'f004a9c004d4a91f985c0bc87b76e3ad9b7d9cb8a5428413b4732d3ff6d0cb84';
export const PYTHON_HOSTLIST_VERIFIER_SHA256 = 'eb411a80b63e3a98599f07d8275460a44866f1f8d7b13be738686621e311d9e5';
export const ATOMISTIC_BOOTSTRAP_OUTCOME_SCRIPT_SHA256 = '1f4198da6874f2ad10138c4b7ee030ed8a05f22d6c4d55deab5fe622d3728684';
export const ATOMISTIC_RUNTIME_INVENTORY_VERIFIER_SHA256 = 'bf517278cd097517953609e089fd29aae7de5472d5e59a63624eb1bce3f93f5c';
export const ATOMISTIC_RUNTIME_INPUT_CONTRACT_SHA256 = 'd5174d4630d959ac3c93d4a75027ac0258e40a776b689d6ac98f62b61f4a5937';
export const ATOMISTIC_CONTAINER_OBSERVATION_WRITER_SHA256 = '83b33e718297f1a90939e029ddfe407ab6e754b35ac2e5f6a27baf8de0143b18';
// The S/V workflows are immutable historical programs and must keep binding
// the exact discovery-only 0.2 lock they executed. The checked-in Commit-F
// lock is separately pinned below; changing it must not rewrite that history.
export const ATOMISTIC_RUNTIME_DISCOVERY_LOCK_SHA256 = '5ce8c368b73f2f34e414caa349b89096ee844b3135a724045e65fbb5bd1aed2e';
export const ATOMISTIC_CURRENT_RUNTIME_LOCK_SHA256 = 'b8c352aacfef3f74210d2dbf2002400887e35d21670f5f93da6a8003670bafa1';
export const ATOMISTIC_HISTORICAL_RUNTIME_DISCOVERY_LOCK_SHA256 = '79e72ba821cfaac298a4898a9b09bd4f0159d3560cdf8f2ac5ba4b005402f6fe';
export const ATOMISTIC_SCIENTIFIC_PLAN_SHA256 = 'd3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2';
export const SETUPTOOLS_RUNTIME_WHEEL_FILENAME = 'setuptools-84.0.0-py3-none-any.whl';
export const SETUPTOOLS_RUNTIME_WHEEL_SHA256 = '51a52592b3b99e102b609654876bd65f19f999935166d1352678931132b0c670';
export const SETUPTOOLS_STARTUP_HOOK_SHA256 = '2638ce9e2500e572a5e0de7faed6661eb569d1b696fcba07b0dd223da5f5d224';
export const ATOMISTIC_DOCKERFILE_DIGESTS = Object.freeze({
  'atomistic/containers/mace.Dockerfile': 'sha256:d97f48e8d8d75c2b4d22acf46ec5aa7ba21cb2acd59db7a4745e2021f4438b5f',
  'atomistic/containers/mattersim.Dockerfile': 'sha256:d672230adbc540391e8be4424aca24c50e473ca46a5a244d06838f55cc288455',
  'atomistic/containers/openmm-water.Dockerfile': 'sha256:939e5358108493c6b0e03f2f177a3de88bbe0d8e013d1d615a52d27a6f185884',
});

const CHECKOUT_ACTION = 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262';
const SETUP_NODE_ACTION = 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020';
const SETUP_PYTHON_ACTION = 'actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065';
const UPLOAD_ARTIFACT_ACTION = 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02';
const GITHUB_SCRIPT_ACTION = 'actions/github-script@f28e40c7f34bde8b3046d885e986cb6290c5673b';
export const ATOMISTIC_BOOTSTRAP_VERIFY_CHECKOUT_ACTION = 'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803';
export const ATOMISTIC_BOOTSTRAP_VERIFY_SETUP_NODE_ACTION = 'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38';
export const ATOMISTIC_BOOTSTRAP_VERIFY_UPLOAD_ACTION = 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02';
export const ATOMISTIC_BOOTSTRAP_VERIFY_DOWNLOAD_ACTION = 'actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0';
export const ATOMISTIC_BOOTSTRAP_VERIFY_ATTEST_ACTION = 'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6';
export const ATOMISTIC_BOOTSTRAP_VERIFY_NODE_VERSION = '24.16.0';
export const ATOMISTIC_BOOTSTRAP_VERIFY_RUN_DIGESTS = Object.freeze({
  'Refuse unapproved runs or a verifier outside protected main': 'sha256:3fccf4de4cb0611cb8e7bb45ac05d4b433d4f3823a3a5cc06649cd5b1ed04049',
  'Install locked verifier dependencies without lifecycle scripts': 'sha256:9514b3517c824a0127f135c25784c58557b6a032b154a5a28b501578c90fc70e',
  'Verify both replicas and create one canonical bootstrap-only receipt': 'sha256:2c84744b91126abf23ac2e5d615b2a94976535e96372c1c6d1919789c1d2cc3f',
  'Create a clean receipt download directory': 'sha256:50df08f79a467e5aa999616094b630f87faa2fa9f386c1a09a50e056f0e46e60',
  'Match the single downloaded receipt to the verify job bytes': 'sha256:55d6c9d0fe405505ceb9487e78e1a07fefbd3d025a44437f7dfb748520b97299',
});
export const OPENMM_TIP3P_PROTECTED_RUN_DIGESTS = Object.freeze({
  'Bind runner-scoped private paths': 'sha256:74a7a4f56113f1182e0afdba1f4e25e47fec6584c43409e623bd7a8ad127ec35',
  'Refuse dispatch outside protected main Linux x86_64': 'sha256:456a1faabd99d49666f1af5ca3e1250e8a6deaa14e191b8399d67b640b4ed0dc',
  'Install locked verifier dependencies without lifecycle scripts': 'sha256:5469a61773fc1075e46bc071c03a1eef6ad400f0dc794cf06a3e2abead9bd176',
  'Create isolated private acquisition and execution roots': 'sha256:a25418c8dabfa5f4a87c28bbb375ea294b23564363f1f8367bcc9ecc50dbb15e',
  'Acquire the five locked OpenMM inputs and wheels': 'sha256:55611f4ad5c2403c3bad900f21ede77603da9e59ec213e666fb8dba0c5920621',
  'Acquire the exact locked private Chromium archive': 'sha256:15f3b58515e0f91aa95220263d27f100a02c1c17aa410b36ad71d1c428f877d6',
  'Safely extract the exact locked private Chromium runtime': 'sha256:453375419701fc50539e857a011caf2a6d17d7f657e812a791e77608761316ca',
  'Freeze and verify the exact locked private Chromium runtime': 'sha256:9abca5f60f9af7e119bc40f25a444a12bdc8d42f61569f4506d074ff6584b6fa',
  'Freeze the exact Node and Rolldown browser runtime dependencies': 'sha256:dedbb78dc6b12473ef83148c4726ab672bcec5c4029bc18681d814438a773d1e',
  'Prefetch the pinned base image and record the Docker toolchain': 'sha256:685c6e63f97d7737985a5694cf9d0131069792a7325639e0768f76cdd24dffb5',
  'Build the OpenMM image with build-step network disabled': 'sha256:fc3dc1a0e208949cb8615ea1a34e8260b52b5682bd36953550d0b0286c79c2a0',
  'Create the hardened offline producer container': 'sha256:65ccfaf9873203e3efe802f9dbfc2fb0a57bce13b49710ec3337e0094c20f0dd',
  'Start and wait for the private producer': 'sha256:f8035bad4801cd9a0645b96de9df145494bb5ecb32839e41df2702145d55cb7d',
  'Independently verify the complete private producer output': 'sha256:11c57e6b76cc8c3d3e2b811cc6317fe3b90285d6b092e9c346e9e72dfd171625',
  'Require the exact independently verified-pass receipt': 'sha256:1ac97403754bdf2301bde22b9c9f4b925b4515231bc8f961ac8e466332d39a53',
  'Freeze the verified OpenMM source and control receipt for private browser modes': 'sha256:6f6dcf059bd913547f1217676aaa335db8b6806467bc55f9cf58dcfdd12b22a9',
  'Load and canary the exact Chromium AppArmor userns profile': 'sha256:c700ed6c6803162ef930c91d8a0ee9c454c939f3b7ba350465846f044608a923',
  'Run the three protected private browser modes': 'sha256:44e26daabb5745b292e9219832418adb2436d17bc383dd81297e1c4fab94e99f',
  'Compose the sanitized protected browser evidence': 'sha256:3cbfabdacfc20cfe07ab3ba8e538158b2841f4a97fe75c72d8afc329e8baa5ee',
  'Unload AppArmor profile and remove every private browser execution root': 'sha256:3962c6b1cdda8e356a5d198ec464bc97ec52ff0ddaa872fa706e467b19cc1361',
  'Write the sanitized protected-CI evidence envelope': 'sha256:05e220db38e4a9b5726c28fad1e091007885b27b2db761846b4cdcf85f45a4f8',
  'Stage only the nine allowlisted evidence files': 'sha256:60e0b3198461c4e26949bb621da833c3859f1ab5322de56ca86e0867943beea7',
  'Bind the immutable GitHub artifact identity': 'sha256:7f48b12a81104be3f0e01c314151aa1104f133457d29efe5388fc7f0ef87a342',
  'Refuse attestation outside this protected run and create a clean download root': 'sha256:c59e6957d7f729d11df9aa49e24b745d5e8e356b6badbb21ed5eefff5f217a42',
  'Verify every downloaded evidence file and envelope binding': 'sha256:12b75cf8bb1230abbe6aa13ebf37cf1a776b565edfc182f5913844c514c28f0b',
});

export const ATOMISTIC_SELECTED_SOURCE_FILES = Object.freeze([
  Object.freeze({
    path: '.dockerignore',
    gitBlobOid: '7dd2587d66b2803b491e281044f90e4f654ab861',
    mode: '100644',
    sizeBytes: 338,
    sha256: 'sha256:9d49b6272e10c9c791f6c1288f6df858141bda4613085cc3a811d6edd4aa3ab3',
  }),
  Object.freeze({
    path: 'atomistic/containers/mace.Dockerfile',
    gitBlobOid: '0edc70ad532de4470efff5c170a20f17a94c4847',
    mode: '100644',
    sizeBytes: 3338,
    sha256: 'sha256:d97f48e8d8d75c2b4d22acf46ec5aa7ba21cb2acd59db7a4745e2021f4438b5f',
  }),
  Object.freeze({
    path: 'atomistic/containers/mattersim.Dockerfile',
    gitBlobOid: 'be08afa1d04a4078a559bf2d0eca1bd66eaebb0c',
    mode: '100644',
    sizeBytes: 3533,
    sha256: 'sha256:d672230adbc540391e8be4424aca24c50e473ca46a5a244d06838f55cc288455',
  }),
  Object.freeze({
    path: 'scripts/atomistic/v2/run_model.py',
    gitBlobOid: '6da2a799a8fcba7ada0c3c3922de03f8fa72807a',
    mode: '100644',
    sizeBytes: 35311,
    sha256: 'sha256:f0f0e2dd09784de064f2ba552a90a390523cd9af4244c0853118317bb42a36bb',
  }),
  Object.freeze({
    path: 'scripts/atomistic/v2/runtime_contract.py',
    gitBlobOid: '38a2d2e263d7f25893ec5a79353300ba6ad7eb42',
    mode: '100644',
    sizeBytes: 53577,
    sha256: 'sha256:0a7f2e6e92cfdaeea0a9b532b152fa32c3a562500d7e1962a1573a8b072c34e2',
  }),
]);

export const ATOMISTIC_RUNTIME_MATERIALIZATIONS = Object.freeze([
  Object.freeze({
    name: 'run_model.py',
    sourcePath: 'scripts/atomistic/v2/run_model.py',
    buildPath: 'scripts/atomistic/run_model.py',
    standardContainerPath: '/opt/tailing-venv/lib/python3.12/site-packages/run_model.py',
    sizeBytes: 35311,
    mode: '100644',
    sha256: 'sha256:f0f0e2dd09784de064f2ba552a90a390523cd9af4244c0853118317bb42a36bb',
  }),
  Object.freeze({
    name: 'runtime_contract.py',
    sourcePath: 'scripts/atomistic/v2/runtime_contract.py',
    buildPath: 'scripts/atomistic/runtime_contract.py',
    standardContainerPath: '/opt/tailing-venv/lib/python3.12/site-packages/runtime_contract.py',
    sizeBytes: 53577,
    mode: '100644',
    sha256: 'sha256:0a7f2e6e92cfdaeea0a9b532b152fa32c3a562500d7e1962a1573a8b072c34e2',
  }),
]);

export const SENTINEL_REPORT_SCRIPT_DIGESTS = Object.freeze({
  'Validate the source run, pull request, and report artifact': 'sha256:8a17fc74830ecdf60a1405e28c47bded14f1221eabc060b96f612fcf7bb30153',
  'Download, bound, and publish the report as inert pull-request data': 'sha256:8f4a717e751b99b5abb603fa72cdcac8d01e4d1e193c3c36da7fb062af455c0a',
});

const ATOMISTIC_BOOTSTRAP_QUARANTINE_POLICY = Object.freeze({
  schemaVersion: 'tf.atomistic-bootstrap-quarantine/0.2',
  state: 'active',
  enforcementMode: 'deny-quarantined-require-exact-selected/v1',
  quarantinedRunner: Object.freeze({
    runnerDigest: ATOMISTIC_BOOTSTRAP_QUARANTINED_RUNNER_DIGEST,
    runnerDigestProtocol: 'sha256-canonical-json-sorted-runner-file-identities/v1',
    runtimeSourceRevision: '9a67f4509588d242838c736a580b6ec5badc18f9',
    runtimeLock: Object.freeze({
      revision: ATOMISTIC_RUNTIME_SOURCE_REVISION,
      path: 'evaluation/atomistic/runtime-lock.json',
      rawDigest: `sha256:${ATOMISTIC_HISTORICAL_RUNTIME_DISCOVERY_LOCK_SHA256}`,
    }),
    scientificPlan: Object.freeze({
      revision: ATOMISTIC_RUNTIME_SOURCE_REVISION,
      path: 'evaluation/atomistic/reproduction-plan.json',
      rawDigest: `sha256:${ATOMISTIC_SCIENTIFIC_PLAN_SHA256}`,
    }),
    reasonCode: 'contradictory-bootstrap-promotion-claim',
    reason: 'The locked R5 runner emits environment.provenance.promotionEligible=true in bootstrap-not-reproduced output and conflates workflow and runtime-source revisions.',
    acceptedReplicaCount: 0,
    nonRetroactiveRunIds: Object.freeze([33231316217, 33231323492]),
  }),
  selectedRunner: Object.freeze({
    implementation: 'tf.atomistic-runner/v2',
    runnerDigest: ATOMISTIC_BOOTSTRAP_SELECTED_RUNNER_DIGEST,
    runnerDigestProtocol: 'sha256-canonical-json-sorted-name-standard-container-path-size-sha256/v1',
    runtimeSourceRevision: ATOMISTIC_RUNTIME_SOURCE_REVISION,
    sourceDateEpoch: ATOMISTIC_RUNTIME_SOURCE_DATE_EPOCH,
    sourceManifestProtocol: 'sha256-canonical-json-ordered-path-mode-size-sha256/v1',
    sourceManifestDigest: ATOMISTIC_SOURCE_MANIFEST_DIGEST,
    sourceFiles: ATOMISTIC_SELECTED_SOURCE_FILES,
    materializationMethod: 'immutable-git-source-to-isolated-build-context-to-standard-container/v1',
    materializationProtocol: 'sha256-canonical-json-ordered-runtime-materializations/v1',
    materializationDigest: ATOMISTIC_MATERIALIZATION_DIGEST,
    materializations: ATOMISTIC_RUNTIME_MATERIALIZATIONS,
  }),
  claims: Object.freeze({
    evidenceClass: 'bootstrap-not-reproduced',
    promotionEligible: false,
    comparable: false,
    reproduced: false,
  }),
});

// The shell programs are part of the supply-chain policy surface. Binding the
// parsed run strings makes a weakened guard, alternate index, extra mount,
// networked install/build or broader upload fail until policy and tests are
// reviewed in the same change.
export const ATOMISTIC_BOOTSTRAP_RUN_DIGESTS = Object.freeze({
  'Refuse non-main, non-Linux, or non-x86_64 dispatches': 'sha256:b0b073809f7ff4489ba86cc089db4dbb5176605d6fe93b7cadde6887187d7fa2',
  'Create fresh, model-isolated working directories': 'sha256:e675db9b5587d29f8f4409710e6f2f33cfa9e8ec0566e030ed6fb9fdbc3e1a5e',
  'Bind paths and runner constants from the frozen plan': 'sha256:7982583ba2c8d768bc48f0d9452d98ff57847931413196e1eb2934e78265c333',
  'Verify and pull the pinned Linux amd64 base and Dockerfile frontend': 'sha256:08fcc479df851c237b5921a6ea99099d8ceda55fb6f8e79dc82d1c25ffd3b86a',
  'Fetch and hash-check the selected assets': 'sha256:71b0cf5860fa646b6041d031d2a247c870df64f7daa193f9d6749c3845239267',
  'Preprocess structures without mounting any model checkpoint': 'sha256:80600407d01c2b63c4011632297690437eb71aefafac02dd99698eba0da7c2f7',
  'Download one fresh resolved wheelhouse in the online phase': 'sha256:c2d2f61203b3fc136bc181d27a6dbe83a416b27b78020ebd1a03fbe94cca6ccb',
  'Resolve an exact lock from the offline wheelhouse': 'sha256:e6a5bc4bd027ebbd8334a2e18cf1a4b3423c7fdd5acdf3c878e3c3cda80eb296',
  'Freeze and verify the exact resolved wheel set': 'sha256:0b67e4d2273b5d642449486f0629db9b1f714c1f159356eaa0e57e06224dae7c',
  'Prove a cold, hash-locked install with no network': 'sha256:be109a394b3a765414bcf932c12c89edf72435def72704e240cb8a183d113543',
  'Build the isolated runtime image with no build-step network': 'sha256:183b00d019e7008ebceea6c4a2559cd4e2dc2f860ce282af077a7c2b8bf4a01b',
  'Run checkpoint deserialization and smoke predictions in the final sandbox': 'sha256:0666e9a43a19387ede8bdeca300b20d9297bc98a99ef8888a91d6d1dfa222c07',
  'Stage only non-promotional bootstrap outputs': 'sha256:1981a130b179eaa43f869306c14ee07c71a2d641c7d0b7e10f319213ed877256',
});

const ATOMISTIC_BOOTSTRAP_STEP_IDS = Object.freeze({
  'Refuse non-main, non-Linux, or non-x86_64 dispatches': 'guard',
  'Create fresh, model-isolated working directories': 'directories',
  'Bind paths and runner constants from the frozen plan': 'bind',
  'Verify and pull the pinned Linux amd64 base and Dockerfile frontend': 'base',
  'Fetch and hash-check the selected assets': 'assets',
  'Preprocess structures without mounting any model checkpoint': 'structures',
  'Download one fresh resolved wheelhouse in the online phase': 'wheelhouse',
  'Resolve an exact lock from the offline wheelhouse': 'resolve',
  'Freeze and verify the exact resolved wheel set': 'freeze',
  'Prove a cold, hash-locked install with no network': 'cold_install',
  'Build the isolated runtime image with no build-step network': 'build',
  'Run checkpoint deserialization and smoke predictions in the final sandbox': 'inference',
  'Stage only non-promotional bootstrap outputs': 'stage_outputs',
});

const ATOMISTIC_BOOTSTRAP_OUTCOME_ENV = Object.freeze({
  STAGE_GUARD: '${{ steps.guard.outcome }}',
  STAGE_DIRECTORIES: '${{ steps.directories.outcome }}',
  STAGE_BIND: '${{ steps.bind.outcome }}',
  STAGE_BASE: '${{ steps.base.outcome }}',
  STAGE_ASSETS: '${{ steps.assets.outcome }}',
  STAGE_STRUCTURES: '${{ steps.structures.outcome }}',
  STAGE_WHEELHOUSE: '${{ steps.wheelhouse.outcome }}',
  STAGE_RESOLVE: '${{ steps.resolve.outcome }}',
  STAGE_FREEZE: '${{ steps.freeze.outcome }}',
  STAGE_COLD_INSTALL: '${{ steps.cold_install.outcome }}',
  STAGE_BUILD: '${{ steps.build.outcome }}',
  STAGE_INFERENCE: '${{ steps.inference.outcome }}',
});

export const DOCKERIGNORE_ALLOWLIST = Object.freeze([
  '**',
  '!.dockerignore',
  '!atomistic/',
  '!atomistic/containers/',
  '!atomistic/containers/mattersim.Dockerfile',
  '!atomistic/containers/mace.Dockerfile',
  '!atomistic/locks/',
  '!atomistic/locks/mattersim.requirements.lock',
  '!atomistic/locks/mace.requirements.lock',
  '!scripts/',
  '!scripts/atomistic/',
  '!scripts/atomistic/run_model.py',
  '!scripts/atomistic/runtime_contract.py',
]);

export function inspectWorkflowSource(relativePath, source) {
  const failures = [];
  let workflow;
  try {
    workflow = parseYaml(source);
  } catch (error) {
    return [`${relativePath}: workflow YAML is invalid or contains duplicate keys (${error instanceof Error ? error.message : String(error)}).`];
  }
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return [`${relativePath}: workflow root must be a mapping.`];
  if (hasObjectCycle(workflow)) return [`${relativePath}: cyclic YAML aliases are forbidden.`];
  const triggers = workflow.on;
  if (triggers && typeof triggers === 'object' && !Array.isArray(triggers) && Object.hasOwn(triggers, 'pull_request_target')) failures.push(`${relativePath}: pull_request_target is forbidden.`);
  if (triggers === 'pull_request_target' || (Array.isArray(triggers) && triggers.includes('pull_request_target'))) failures.push(`${relativePath}: pull_request_target is forbidden.`);
  if (/curl\b[^\n|]*\|\s*(?:ba)?sh\b/i.test(source) || /wget\b[^\n|]*\|\s*(?:ba)?sh\b/i.test(source)) failures.push(`${relativePath}: network-to-shell pipelines are forbidden.`);

  walk(workflow, (key, value) => {
    if (key === 'uses' && typeof value === 'string') {
      if (value.startsWith('./')) return;
      if (value.startsWith('docker://')) {
        if (!immutableOciReference(value.slice('docker://'.length))) failures.push(`${relativePath}: Docker action ${value} is not pinned by sha256 digest.`);
        return;
      }
      const separator = value.lastIndexOf('@');
      const revision = separator >= 0 ? value.slice(separator + 1) : '';
      if (!/^[0-9a-f]{40}$/.test(revision)) failures.push(`${relativePath}: external action ${value} is not pinned to a full commit SHA.`);
    }
    if (key === 'image' && typeof value === 'string' && !immutableOciReference(value)) failures.push(`${relativePath}: container image ${value} is not pinned by sha256 digest.`);
    if (key === 'container' && typeof value === 'string' && !immutableOciReference(value)) failures.push(`${relativePath}: job container ${value} is not pinned by sha256 digest.`);
  });

  for (const job of Object.values(workflow.jobs ?? {})) {
    if (!job || typeof job !== 'object' || Array.isArray(job)) continue;
    for (const step of job.steps ?? []) {
      if (!step || typeof step !== 'object' || typeof step.uses !== 'string' || !step.uses.startsWith('actions/checkout@')) continue;
      if (step.with?.['persist-credentials'] !== false) failures.push(`${relativePath}: actions/checkout must set persist-credentials: false.`);
    }
  }
  if (relativePath === SENTINEL_EVALUATION_WORKFLOW_PATH) {
    failures.push(...inspectSentinelEvaluationWorkflow(workflow, source));
  }
  if (relativePath === SENTINEL_REPORT_WORKFLOW_PATH) failures.push(...inspectSentinelReportWorkflow(workflow));
  if (relativePath === ATOMISTIC_BOOTSTRAP_WORKFLOW_PATH) failures.push(...inspectAtomisticBootstrapWorkflow(workflow));
  if (relativePath === ATOMISTIC_BOOTSTRAP_VERIFY_WORKFLOW_PATH) failures.push(...inspectAtomisticBootstrapVerifyWorkflow(workflow));
  if (relativePath === OPENMM_TIP3P_PROTECTED_WORKFLOW_PATH) {
    failures.push(...inspectOpenMmTip3pProtectedWorkflow(workflow, source));
  }
  if (relativePath === FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH) {
    failures.push(...inspectFullCandidateRegistrationWorkflow(workflow, source));
  }
  return failures;
}

export function inspectFullCandidateRegistrationWorkflowSource(relativePath, source) {
  if (relativePath !== FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH) {
    return [
      `${relativePath}: registration-only workflow must use the reviewed path ${FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH}.`,
    ];
  }
  let workflow;
  try {
    workflow = parseYaml(source);
  } catch (error) {
    return [
      `${relativePath}: workflow YAML is invalid or contains duplicate keys (${error instanceof Error ? error.message : String(error)}).`,
    ];
  }
  return inspectFullCandidateRegistrationWorkflow(workflow, source);
}

export function inspectFullCandidateRegistrationWorkflow(workflow, source = '') {
  const failures = [];
  const prefix = `${FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH}:`;
  const expectedTrigger = {
    push: {
      'branches-ignore': ['**'],
      'tags-ignore': ['**'],
    },
  };
  const expectedStep = {
    name: 'Unreachable registration quarantine',
    shell: 'bash',
    run: "set -euo pipefail\nprintf '%s\\n' 'UNREACHABLE: registration-only workflow has no producer execution.'\nexit 1\n",
  };
  const expectedJob = {
    if: '${{ false }}',
    'runs-on': 'ubuntu-24.04',
    'timeout-minutes': 1,
    permissions: {},
    steps: [expectedStep],
  };
  const expectedWorkflow = {
    name: FULL_CANDIDATE_REGISTRATION_WORKFLOW_NAME,
    on: expectedTrigger,
    permissions: {},
    jobs: { 'registration-quarantine': expectedJob },
  };

  if (sha256(source) !== `sha256:${FULL_CANDIDATE_REGISTRATION_WORKFLOW_SHA256}`
      || Buffer.byteLength(source) !== FULL_CANDIDATE_REGISTRATION_WORKFLOW_SIZE_BYTES) {
    failures.push(`${prefix} complete reviewed registration-only workflow bytes drifted.`);
  }
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
    return [...failures, `${prefix} workflow root must be a mapping.`];
  }
  if (hasObjectCycle(workflow)) {
    return [...failures, `${prefix} cyclic YAML aliases are forbidden.`];
  }
  if (!sameJson(Object.keys(workflow), ['name', 'on', 'permissions', 'jobs'])) {
    failures.push(`${prefix} top-level key set or order drifted.`);
  }
  if (workflow.name !== FULL_CANDIDATE_REGISTRATION_WORKFLOW_NAME) {
    failures.push(`${prefix} workflow name differs from the unconfigured producer identity.`);
  }
  if (!sameJson(workflow.on, expectedTrigger)) {
    failures.push(`${prefix} only push with exact all-branch and all-tag ignore filters is allowed.`);
  }
  if (!sameJson(workflow.permissions, {})) {
    failures.push(`${prefix} top-level token permissions must remain empty.`);
  }

  const jobs = workflow.jobs && typeof workflow.jobs === 'object' && !Array.isArray(workflow.jobs)
    ? workflow.jobs
    : {};
  if (!sameJson(Object.keys(jobs), ['registration-quarantine'])) {
    failures.push(`${prefix} exactly one registration-quarantine job is allowed.`);
  }
  const job = jobs['registration-quarantine'];
  if (!job || typeof job !== 'object' || Array.isArray(job)) {
    return [...failures, `${prefix} registration-quarantine job is missing.`];
  }
  if (!sameJson(Object.keys(job), [
    'if', 'runs-on', 'timeout-minutes', 'permissions', 'steps',
  ])) {
    failures.push(`${prefix} registration-quarantine job key set or order drifted.`);
  }
  if (job.if !== '${{ false }}') {
    failures.push(`${prefix} registration-quarantine job must use the literal-false expression.`);
  }
  if (job['runs-on'] !== 'ubuntu-24.04' || job['timeout-minutes'] !== 1) {
    failures.push(`${prefix} future runner selector or one-minute bound drifted.`);
  }
  if (!sameJson(job.permissions, {})) {
    failures.push(`${prefix} job token permissions must remain empty.`);
  }
  if (!sameJson(job.steps, [expectedStep])) {
    failures.push(`${prefix} unreachable canary must remain the sole exact bash step.`);
  }
  if (!sameJson(workflow, expectedWorkflow)) {
    failures.push(`${prefix} exact YAML shape or order-relevant semantics drifted.`);
  }
  return failures;
}

export function inspectAtomisticBootstrapQuarantineSource(relativePath, source) {
  const failures = [];
  if (relativePath !== ATOMISTIC_BOOTSTRAP_QUARANTINE_PATH) {
    return [`${relativePath}: bootstrap quarantine must use the reviewed path ${ATOMISTIC_BOOTSTRAP_QUARANTINE_PATH}.`];
  }
  const rawDigest = sha256(source);
  if (rawDigest !== `sha256:${ATOMISTIC_BOOTSTRAP_QUARANTINE_SHA256}`) {
    failures.push(`${relativePath}: complete reviewed quarantine bytes drifted.`);
  }
  let quarantine;
  try {
    quarantine = JSON.parse(Buffer.isBuffer(source) ? source.toString('utf8') : source);
  } catch (error) {
    failures.push(`${relativePath}: quarantine JSON is invalid (${error instanceof Error ? error.message : String(error)}).`);
    return failures;
  }
  if (!sameJson(quarantine, ATOMISTIC_BOOTSTRAP_QUARANTINE_POLICY)) {
    failures.push(`${relativePath}: quarantine schema, runner identity, reason, replica count, or non-retroactive runs drifted.`);
  }
  return failures;
}

export function inspectSentinelEvaluationWorkflow(workflow, source = '') {
  const failures = [];
  const prefix = `${SENTINEL_EVALUATION_WORKFLOW_PATH}:`;
  if (sha256(source) !== `sha256:${SENTINEL_EVALUATION_WORKFLOW_SHA256}`) {
    failures.push(`${prefix} complete reviewed workflow bytes drifted.`);
  }
  if (workflow.name !== 'Tailing Sentinel') failures.push(`${prefix} evaluation workflow name drifted.`);
  if (!sameJson(workflow.on, {
    push: { branches: ['**'] },
    pull_request: null,
    merge_group: null,
  })) failures.push(`${prefix} evaluation triggers drifted.`);
  if (!sameJson(workflow.permissions, { contents: 'read' })) failures.push(`${prefix} candidate evaluation must have only contents: read.`);

  const jobs = workflow.jobs && typeof workflow.jobs === 'object' && !Array.isArray(workflow.jobs) ? workflow.jobs : {};
  if (!sameJson(Object.keys(jobs), ['evaluate'])) failures.push(`${prefix} candidate workflow may contain only the read-only evaluate job.`);
  const job = jobs.evaluate;
  if (!job || typeof job !== 'object' || Array.isArray(job)) return [...failures, `${prefix} evaluate job is missing.`];
  if (!sameJson(Object.keys(job).sort(), [
    'permissions', 'runs-on', 'steps', 'timeout-minutes',
  ].sort())) failures.push(`${prefix} evaluate job contains an unreviewed key.`);
  if (!sameJson(job.permissions, { contents: 'read' })) failures.push(`${prefix} evaluate job must have only contents: read.`);
  if (job['runs-on'] !== 'ubuntu-24.04' || job['timeout-minutes'] !== 75) {
    failures.push(`${prefix} evaluate job must remain a bounded Ubuntu 24.04 job.`);
  }

  const steps = Array.isArray(job.steps) ? job.steps : [];
  const checkouts = steps.filter((step) => step?.uses === CHECKOUT_ACTION);
  if (checkouts.length !== 1 || !sameJson(checkouts[0], {
    uses: CHECKOUT_ACTION,
    with: { 'persist-credentials': false, 'fetch-depth': 0 },
  })) failures.push(`${prefix} evaluation checkout must fetch immutable ancestor objects without credentials.`);
  const setupNodes = steps.filter((step) => step?.uses === SETUP_NODE_ACTION);
  if (setupNodes.length !== 1 || !sameJson(setupNodes[0], {
    uses: SETUP_NODE_ACTION,
    with: { 'node-version': '24.16.0', cache: 'npm' },
  })) failures.push(`${prefix} Node runtime setup drifted.`);
  const setupPythons = steps.filter((step) => step?.uses === SETUP_PYTHON_ACTION);
  if (setupPythons.length !== 1 || !sameJson(setupPythons[0], {
    uses: SETUP_PYTHON_ACTION,
    with: { 'python-version': '3.12.11' },
  })) failures.push(`${prefix} Python runtime setup drifted.`);
  const expectedSimpleGates = {
    install: { id: 'install', 'continue-on-error': true, run: 'npm ci' },
    lint: {
      id: 'lint', if: 'always()', 'continue-on-error': true, run: 'npm run lint',
    },
    typecheck: {
      id: 'typecheck', if: 'always()', 'continue-on-error': true, run: 'npm run typecheck',
    },
    test: {
      id: 'test', if: 'always()', 'continue-on-error': true, run: 'npm test',
    },
    atomistic_manifest: {
      id: 'atomistic_manifest',
      if: 'always()',
      'continue-on-error': true,
      run: 'npm run atomistic:validate',
    },
    audit: {
      id: 'audit',
      if: 'always()',
      'continue-on-error': true,
      run: 'npm audit --audit-level=low',
    },
    release_manifest: {
      id: 'release_manifest',
      if: 'always()',
      'continue-on-error': true,
      run: 'npm run release:manifest',
    },
  };
  for (const [id, expected] of Object.entries(expectedSimpleGates)) {
    const matches = steps.filter((step) => step?.id === id);
    if (matches.length !== 1 || !sameJson(matches[0], expected)) {
      failures.push(`${prefix} ${id} gate drifted.`);
    }
  }
  for (const id of ['build', 'report_build']) {
    const matches = steps.filter((step) => step?.id === id);
    if (matches.length !== 1 || !sameJson(matches[0], {
      id,
      if: 'always()',
      'continue-on-error': true,
      env: { NEXT_PUBLIC_TAILING_COMMIT_SHA: '${{ github.sha }}' },
      run: 'npm run build',
    })) failures.push(`${prefix} ${id} revision-bound build gate drifted.`);
  }
  const atomisticGates = steps.filter((step) => step?.id === 'atomistic_manifest');
  if (atomisticGates.length !== 1 || !sameJson(atomisticGates[0], {
    id: 'atomistic_manifest',
    if: 'always()',
    'continue-on-error': true,
    run: 'npm run atomistic:validate',
  })) failures.push(`${prefix} atomistic plan plus runtime-lock validation gate drifted.`);
  const sentinelMatches = steps.filter((step) => step?.id === 'sentinel');
  const sentinel = sentinelMatches[0];
  if (sentinelMatches.length !== 1 || !sameJson(sentinel, {
    id: 'sentinel',
    if: 'always()',
    'continue-on-error': true,
    env: {
      TAILING_INSTALL_STATUS: '${{ steps.install.outcome }}',
      TAILING_LINT_STATUS: '${{ steps.lint.outcome }}',
      TAILING_TYPECHECK_STATUS: '${{ steps.typecheck.outcome }}',
      TAILING_TEST_STATUS: '${{ steps.test.outcome }}',
      TAILING_ATOMISTIC_MANIFEST_STATUS: '${{ steps.atomistic_manifest.outcome }}',
      TAILING_BUILD_STATUS: '${{ steps.build.outcome }}',
      TAILING_AUDIT_STATUS: '${{ steps.audit.outcome }}',
    },
    run: 'npm run evaluate',
  })) failures.push(`${prefix} Sentinel upstream status binding drifted.`);
  const finalGate = steps.at(-1);
  const expectedFinalRun = 'node -e "const failed = ['
    + "'INSTALL','LINT','TYPECHECK','TEST','ATOMISTIC_MANIFEST','BUILD','AUDIT',"
    + "'SENTINEL','REPORT_BUILD','RELEASE_MANIFEST'].filter(name => "
    + "process.env[name + '_STATUS'] !== 'success'); if (failed.length) { "
    + "console.error('Failed gates: ' + failed.join(', ')); process.exit(1); }\"";
  if (!sameJson(finalGate, {
    if: 'always()',
    env: {
      INSTALL_STATUS: '${{ steps.install.outcome }}',
      LINT_STATUS: '${{ steps.lint.outcome }}',
      TYPECHECK_STATUS: '${{ steps.typecheck.outcome }}',
      TEST_STATUS: '${{ steps.test.outcome }}',
      ATOMISTIC_MANIFEST_STATUS: '${{ steps.atomistic_manifest.outcome }}',
      BUILD_STATUS: '${{ steps.build.outcome }}',
      AUDIT_STATUS: '${{ steps.audit.outcome }}',
      SENTINEL_STATUS: '${{ steps.sentinel.outcome }}',
      REPORT_BUILD_STATUS: '${{ steps.report_build.outcome }}',
      RELEASE_MANIFEST_STATUS: '${{ steps.release_manifest.outcome }}',
    },
    run: `${expectedFinalRun}\n`,
  })) failures.push(`${prefix} final ten-gate aggregation drifted.`);
  const reportUploads = steps.filter((step) => step?.uses === UPLOAD_ARTIFACT_ACTION
    && step?.with?.name === 'tailing-sentinel-pr-report-${{ github.run_id }}-${{ github.run_attempt }}');
  if (reportUploads.length !== 1 || !sameJson(reportUploads[0], {
    if: "always() && github.event_name == 'pull_request'",
    uses: UPLOAD_ARTIFACT_ACTION,
    with: {
      name: 'tailing-sentinel-pr-report-${{ github.run_id }}-${{ github.run_attempt }}',
      path: 'evaluation/latest-report.md',
      'if-no-files-found': 'error',
      'retention-days': 1,
    },
  })) failures.push(`${prefix} candidate evaluation must upload exactly one short-lived, run-bound Markdown report artifact.`);
  return failures;
}

export function inspectSentinelReportWorkflow(workflow) {
  const failures = [];
  const prefix = `${SENTINEL_REPORT_WORKFLOW_PATH}:`;
  const expectedPermissions = { actions: 'read', 'pull-requests': 'write' };
  if (workflow.name !== 'Tailing Sentinel Reporter') failures.push(`${prefix} reporter workflow name drifted.`);
  if (!sameJson(workflow.on, {
    workflow_run: {
      workflows: ['Tailing Sentinel'],
      types: ['completed'],
    },
  })) failures.push(`${prefix} reporter must run only after a completed Tailing Sentinel workflow_run.`);
  if (!sameJson(workflow.permissions, expectedPermissions)) failures.push(`${prefix} reporter permissions must be exactly actions: read and pull-requests: write.`);
  if (!sameJson(workflow.concurrency, {
    group: 'sentinel-report-${{ github.event.workflow_run.id }}-${{ github.event.workflow_run.run_attempt }}',
    'cancel-in-progress': false,
  })) failures.push(`${prefix} reporter concurrency must bind source run id and attempt.`);

  const jobs = workflow.jobs && typeof workflow.jobs === 'object' && !Array.isArray(workflow.jobs) ? workflow.jobs : {};
  if (!sameJson(Object.keys(jobs), ['report'])) failures.push(`${prefix} reporter must contain exactly one isolated job.`);
  const job = jobs.report;
  if (!job || typeof job !== 'object' || Array.isArray(job)) return [...failures, `${prefix} report job is missing.`];
  if (!sameJson(Object.keys(job).sort(), ['if', 'permissions', 'runs-on', 'steps', 'timeout-minutes'].sort())) failures.push(`${prefix} reporter job contains an unreviewed key.`);
  if (job.if !== "github.event.workflow_run.event == 'pull_request'") failures.push(`${prefix} reporter job must reject non-pull-request source events before executing.`);
  if (!sameJson(job.permissions, expectedPermissions)) failures.push(`${prefix} reporter job permissions drifted.`);
  if (job['runs-on'] !== 'ubuntu-24.04' || job['timeout-minutes'] !== 5) failures.push(`${prefix} reporter must remain a bounded Ubuntu 24.04 job.`);

  const steps = Array.isArray(job.steps) ? job.steps : [];
  const expectedStepNames = [
    'Validate the source run, pull request, and report artifact',
    'Download, bound, and publish the report as inert pull-request data',
  ];
  if (!sameJson(steps.map((step) => step?.name), expectedStepNames)) failures.push(`${prefix} reporter step set or order drifted.`);
  if (steps.some((step) => typeof step?.run === 'string' || String(step?.uses ?? '').startsWith('actions/checkout@') || String(step?.uses ?? '').startsWith('./'))) {
    failures.push(`${prefix} reporter may not check out or execute candidate-controlled code.`);
  }

  const validate = steps[0];
  const validateScript = validate?.with?.script;
  if (!validate || validate.id !== 'validate' || validate.uses !== GITHUB_SCRIPT_ACTION
      || !sameJson(Object.keys(validate).sort(), ['env', 'id', 'name', 'uses', 'with'].sort())
      || !sameJson(validate.env, {
        EXPECTED_REPOSITORY: 'tony070926-sudo/tailing-future',
        EXPECTED_REPOSITORY_ID: '1349498456',
        EXPECTED_DEFAULT_BRANCH: 'main',
        EXPECTED_WORKFLOW_ID: '344526316',
        EXPECTED_WORKFLOW_NAME: 'Tailing Sentinel',
        EXPECTED_WORKFLOW_PATH: '.github/workflows/evaluate.yml',
        MAX_ARTIFACT_ARCHIVE_BYTES: '65536',
      })
      || !sameJson(Object.keys(validate.with ?? {}).sort(), ['github-token', 'script'].sort())
      || validate.with?.['github-token'] !== '${{ github.token }}'
      || typeof validateScript !== 'string'
      || sha256(validateScript) !== SENTINEL_REPORT_SCRIPT_DIGESTS[expectedStepNames[0]]) {
    failures.push(`${prefix} source-run and artifact validation program drifted.`);
  }

  const publish = steps[1];
  const publishScript = publish?.with?.script;
  if (!publish || publish.if !== "always() && steps.validate.outputs.validated == 'true'"
      || publish.uses !== GITHUB_SCRIPT_ACTION
      || !sameJson(Object.keys(publish).sort(), ['env', 'if', 'name', 'uses', 'with'].sort())
      || !sameJson(publish.env, {
        EXPECTED_REPOSITORY: 'tony070926-sudo/tailing-future',
        EXPECTED_REPOSITORY_ID: '1349498456',
        EXPECTED_ARTIFACT_ID: '${{ steps.validate.outputs.artifact_id }}',
        EXPECTED_ARTIFACT_NAME: '${{ steps.validate.outputs.artifact_name }}',
        EXPECTED_ARTIFACT_DIGEST: '${{ steps.validate.outputs.artifact_digest }}',
        EXPECTED_PR_ID: '${{ steps.validate.outputs.pr_id }}',
        EXPECTED_PR_NUMBER: '${{ steps.validate.outputs.pr_number }}',
        EXPECTED_HEAD_REPOSITORY_ID: '${{ steps.validate.outputs.head_repository_id }}',
        EXPECTED_HEAD_SHA: '${{ steps.validate.outputs.head_sha }}',
        EXPECTED_SOURCE_RUN_ID: '${{ steps.validate.outputs.source_run_id }}',
        EXPECTED_SOURCE_RUN_ATTEMPT: '${{ steps.validate.outputs.source_run_attempt }}',
        EXPECTED_SOURCE_CONCLUSION: '${{ steps.validate.outputs.source_conclusion }}',
        MAX_ARTIFACT_ARCHIVE_BYTES: '65536',
        MAX_REPORT_BYTES: '12000',
      })
      || !sameJson(Object.keys(publish.with ?? {}).sort(), ['github-token', 'script'].sort())
      || publish.with?.['github-token'] !== '${{ github.token }}'
      || typeof publishScript !== 'string'
      || sha256(publishScript) !== SENTINEL_REPORT_SCRIPT_DIGESTS[expectedStepNames[1]]) {
    failures.push(`${prefix} bounded Markdown publication program drifted.`);
  }
  return failures;
}

export function inspectAtomisticBootstrapWorkflow(workflow) {
  const failures = [];
  const prefix = `${ATOMISTIC_BOOTSTRAP_WORKFLOW_PATH}:`;
  if (!sameJson(workflow.on, { workflow_dispatch: null })) failures.push(`${prefix} bootstrap must be manual workflow_dispatch only, without inputs.`);
  if (workflow.name !== 'Atomistic bootstrap predictions (non-promotional)') failures.push(`${prefix} workflow name must preserve the non-promotional boundary.`);
  if (!sameJson(workflow.permissions, { contents: 'read' })) failures.push(`${prefix} permissions must be exactly contents: read with no id-token or attestation authority.`);
  if (!sameJson(workflow.concurrency, {
    group: 'atomistic-bootstrap-${{ github.ref }}-${{ github.sha }}',
    'cancel-in-progress': false,
  })) failures.push(`${prefix} concurrency binding drifted.`);
  if (!sameJson(workflow.env, {
    BASE_IMAGE: ATOMISTIC_BOOTSTRAP_BASE_IMAGE,
    BASE_IMAGE_AMD64_DIGEST: ATOMISTIC_BOOTSTRAP_BASE_AMD64_DIGEST,
    DOCKERFILE_FRONTEND: PINNED_DOCKERFILE_FRONTEND,
  })) failures.push(`${prefix} Node/Python container trust roots or Dockerfile frontend drifted.`);

  const jobs = workflow.jobs && typeof workflow.jobs === 'object' && !Array.isArray(workflow.jobs) ? workflow.jobs : {};
  if (!sameJson(Object.keys(jobs), ['bootstrap'])) failures.push(`${prefix} exactly one isolated bootstrap matrix job is allowed.`);
  const job = jobs.bootstrap;
  if (!job || typeof job !== 'object' || Array.isArray(job)) return [...failures, `${prefix} bootstrap job is missing.`];
  if (!sameJson(Object.keys(job).sort(), ['env', 'name', 'runs-on', 'steps', 'strategy', 'timeout-minutes'].sort())) failures.push(`${prefix} bootstrap job contains an unreviewed key.`);
  if (job.name !== '${{ matrix.model }} isolated bootstrap smoke'
      || job['runs-on'] !== 'ubuntu-24.04' || job['timeout-minutes'] !== 240) {
    failures.push(`${prefix} bootstrap must remain an Ubuntu 24.04 smoke job with the reviewed timeout.`);
  }
  if (!sameJson(job.strategy, {
    'fail-fast': false,
    'max-parallel': 2,
    matrix: { model: ['mattersim', 'mace'] },
  }) || !sameJson(job.env, {
    MODEL: '${{ matrix.model }}',
  })) {
    failures.push(`${prefix} MatterSim and MACE must remain separate matrix executions.`);
  }

  const steps = Array.isArray(job.steps) ? job.steps : [];
  const expectedRunNames = Object.keys(ATOMISTIC_BOOTSTRAP_RUN_DIGESTS);
  const expectedStepNames = [
    'Check out the dispatched revision without credentials',
    'Install the pinned JavaScript runtime',
    ...expectedRunNames,
    'Upload the allowlisted bootstrap bundle',
  ];
  if (!sameJson(steps.map((step) => step?.name), expectedStepNames)) failures.push(`${prefix} bootstrap step set or order drifted.`);

  const checkout = steps.find((step) => step?.name === expectedStepNames[0]);
  if (!sameJson(checkout, {
    name: 'Check out the dispatched revision without credentials',
    uses: CHECKOUT_ACTION,
    with: { 'persist-credentials': false, 'fetch-depth': 0 },
  })) failures.push(`${prefix} checkout action or credential policy drifted.`);
  const setupNode = steps.find((step) => step?.name === expectedStepNames[1]);
  if (!sameJson(setupNode, {
    name: 'Install the pinned JavaScript runtime',
    uses: SETUP_NODE_ACTION,
    with: { 'node-version': ATOMISTIC_BOOTSTRAP_NODE_VERSION },
  })) failures.push(`${prefix} Node action or exact Node ${ATOMISTIC_BOOTSTRAP_NODE_VERSION} runtime drifted.`);

  const runSteps = new Map();
  for (const step of steps) {
    if (typeof step?.run !== 'string') continue;
    if (runSteps.has(step.name)) failures.push(`${prefix} duplicate named run step ${step.name}.`);
    runSteps.set(step.name, step);
  }
  for (const [name, expectedDigest] of Object.entries(ATOMISTIC_BOOTSTRAP_RUN_DIGESTS)) {
    const step = runSteps.get(name);
    const expectedIf = name === 'Stage only non-promotional bootstrap outputs' ? 'always()' : undefined;
    const expectedKeys = expectedIf ? ['env', 'id', 'if', 'name', 'run', 'shell'] : ['id', 'name', 'run', 'shell'];
    if (!step || step.shell !== 'bash' || step.if !== expectedIf
        || step.id !== ATOMISTIC_BOOTSTRAP_STEP_IDS[name]
        || (expectedIf && !sameJson(step.env, ATOMISTIC_BOOTSTRAP_OUTCOME_ENV))
        || !sameJson(Object.keys(step).sort(), expectedKeys.sort())
        || sha256(step.run) !== expectedDigest) {
      failures.push(`${prefix} reviewed shell program drifted: ${name}.`);
    }
  }

  const guard = runSteps.get('Refuse non-main, non-Linux, or non-x86_64 dispatches')?.run ?? '';
  if (!hasAll(guard, [
    ATOMISTIC_BOOTSTRAP_QUARANTINE_PATH,
    `sha256:${ATOMISTIC_BOOTSTRAP_QUARANTINE_SHA256}`,
    ATOMISTIC_BOOTSTRAP_QUARANTINED_RUNNER_DIGEST,
    ATOMISTIC_BOOTSTRAP_SELECTED_RUNNER_DIGEST,
    ATOMISTIC_RUNTIME_SOURCE_REVISION,
    `sha256:${ATOMISTIC_RUNTIME_DISCOVERY_LOCK_SHA256}`,
    `sha256:${ATOMISTIC_HISTORICAL_RUNTIME_DISCOVERY_LOCK_SHA256}`,
    `sha256:${ATOMISTIC_SCIENTIFIC_PLAN_SHA256}`,
    ATOMISTIC_SOURCE_MANIFEST_DIGEST,
    ATOMISTIC_MATERIALIZATION_DIGEST,
    'readBoundedRegularFile(quarantinePath, 16 * 1024)',
    "GIT_CONFIG_NOSYSTEM: '1'",
    "GIT_CONFIG_SYSTEM: '/dev/null'",
    "GIT_CONFIG_GLOBAL: '/dev/null'",
    "GIT_NO_REPLACE_OBJECTS: '1'",
    "GIT_OPTIONAL_LOCKS: '0'",
    "function gitBlobOid(bytes)",
    'gitBlobOid(bytes) !== match[3]',
    'const historicLock = readCommitBlob(',
    'const historicPlan = readCommitBlob(',
    "currentRuntimeLock.schemaVersion !== 'tf.atomistic-runtime-lock/0.2'",
    'currentRuntimeLock.identities?.runnerDigest !== null',
    'currentRuntimeLock.replication?.observations?.length !== quarantine.quarantinedRunner.acceptedReplicaCount',
    "currentRuntimeLock.claims?.evidenceClass !== 'discovery-only-not-reproduced'",
    'currentRuntimeLock.claims?.promotionEligible !== false',
    'currentRuntimeLock.claims?.comparable !== false',
    'currentRuntimeLock.claims?.reproduced !== false',
    "runtimeLock.schemaVersion !== 'tf.atomistic-runtime-lock/0.1'",
    'runtimeLock.identities?.runnerDigest !== null',
    'runtimeLock.replication?.observations?.length !== quarantine.quarantinedRunner.acceptedReplicaCount',
    "runtimeLock.claims?.evidenceClass !== 'discovery-only-not-reproduced'",
    'runtimeLock.claims?.promotionEligible !== false',
    'runtimeLock.claims?.comparable !== false',
    'runtimeLock.claims?.reproduced !== false',
    'const lockedRunnerDigest = sha256(Buffer.from(canonicalJson(runnerFiles)',
    'if (lockedRunnerDigest !== quarantine.quarantinedRunner.runnerDigest)',
    'Bootstrap quarantine runner identity differs from the reviewed runtime lock',
    'if (candidateLegacyDigest === quarantine.quarantinedRunner.runnerDigest)',
    'BOOTSTRAP_QUARANTINE_ACTIVE',
    'contradictory-bootstrap-promotion-claim',
    'acceptedReplicaCount=0',
    '33231316217',
    '33231323492',
    'cannot be retroactively accepted',
    'candidateSourceManifestDigest === quarantine.selectedRunner.sourceManifestDigest',
    'candidateMaterializationDigest === quarantine.selectedRunner.materializationDigest',
    'if (!candidateMappingIsExact || candidateRunnerDigest !== quarantine.selectedRunner.runnerDigest)',
    'BOOTSTRAP_RUNNER_NOT_SELECTED',
    ...ATOMISTIC_SELECTED_SOURCE_FILES.flatMap((source) => Object.values(source).map(String)),
    ...ATOMISTIC_RUNTIME_MATERIALIZATIONS.flatMap((mapping) => Object.values(mapping).map(String)),
  ])) failures.push(`${prefix} guard must deny legacy R5, admit only the exact P v2 projection, and fail closed on unknown candidates after bounded historical-object verification.`);

  const upload = steps.find((step) => step?.name === expectedStepNames.at(-1));
  if (!sameJson(upload, {
    name: 'Upload the allowlisted bootstrap bundle',
    if: "always() && steps.stage_outputs.outcome == 'success'",
    uses: UPLOAD_ARTIFACT_ACTION,
    with: {
      name: 'tailing-atomistic-bootstrap-${{ matrix.model }}-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}',
      path: '${{ runner.temp }}/tailing-atomistic-publish/${{ matrix.model }}',
      'if-no-files-found': 'error',
      'include-hidden-files': false,
      'retention-days': 7,
    },
  })) failures.push(`${prefix} artifact upload must remain the exact non-promotional allowlisted bundle.`);

  const nprocUlimitPattern = /--ulimit(?:=|\s+)["']?nproc=/;
  const executable = [...runSteps.values()].map((step) => step.run).join('\n');
  if (nprocUlimitPattern.test(executable)) {
    failures.push(`${prefix} container task limits must use cgroup pids-limit, not host-UID-scoped RLIMIT_NPROC.`);
  }
  const declaredUlimits = executable.match(/--ulimit(?:=|\s+)(?:["'][^"'\n]+["']|[^\s\\]+)/g) ?? [];
  const expectedUlimits = new Map([
    ['--ulimit nofile=64:64', 1],
    ['--ulimit fsize=2097152:2097152', 1],
    ['--ulimit nofile=256:256', 3],
    ['--ulimit fsize=16777216:16777216', 1],
    ['--ulimit nofile=1024:1024', 4],
    ['--ulimit core=0:0', 1],
    ['--ulimit fsize=134217728:134217728', 1],
  ]);
  const actualUlimits = new Map();
  for (const declaration of declaredUlimits) actualUlimits.set(declaration, (actualUlimits.get(declaration) ?? 0) + 1);
  if (declaredUlimits.length !== 12
    || actualUlimits.size !== expectedUlimits.size
    || [...expectedUlimits].some(([declaration, count]) => actualUlimits.get(declaration) !== count)) {
    failures.push(`${prefix} Docker ulimit declarations must match the exact reviewed nofile, fsize and core multiset.`);
  }
  const dockerRuns = executable.match(/\bdocker run\b/g) ?? [];
  const amd64DockerRuns = executable.match(/\bdocker run --rm --platform=linux\/amd64\b/g) ?? [];
  if (dockerRuns.length !== 8 || amd64DockerRuns.length !== dockerRuns.length) failures.push(`${prefix} every declared container must be Linux/amd64.`);
  const download = runSteps.get('Download one fresh resolved wheelhouse in the online phase')?.run ?? '';
  const indexUrls = [...download.matchAll(/--index-url\s+(https:\/\/[^\s'"\\]+)/g)].map((match) => match[1]);
  if (!sameJson(indexUrls, [ATOMISTIC_BOOTSTRAP_PYTORCH_INDEX, ATOMISTIC_BOOTSTRAP_PYTORCH_INDEX, ATOMISTIC_BOOTSTRAP_PYPI_INDEX])
      || /--extra-index-url\b/.test(download)) {
    failures.push(`${prefix} PyTorch wheels must use only the official CPU index and all remaining dependencies only PyPI plus the local wheelhouse.`);
  }
  const noCacheDownloads = download.match(/--no-cache-dir\b/g) ?? [];
  if (noCacheDownloads.length !== 4 || /PIP_CACHE_DIR|--cache-dir\b/.test(download)
      || !hasAll(download, ['--memory=3g', '--memory-swap=3g', '--tmpfs /tmp:rw,exec,nosuid,nodev,size=1g,mode=1777'])) {
    failures.push(`${prefix} all four resolver downloads must disable caching inside the unchanged 1 GiB tmpfs and 3 GiB memory boundary.`);
  }
  const sourceBuildStart = download.indexOf('if [ "$MODEL" = mace ]; then');
  const sourceBuildDelimiter = '\nfi\ndocker run --rm';
  const sourceBuildEnd = download.indexOf(sourceBuildDelimiter, sourceBuildStart);
  const sourceBuild = sourceBuildStart >= 0 && sourceBuildEnd > sourceBuildStart
    ? download.slice(sourceBuildStart, sourceBuildEnd + '\nfi'.length)
    : '';
  if (!hasAll(sourceBuild, [
    PYTHON_HOSTLIST_SDIST_URL,
    '37326',
    PYTHON_HOSTLIST_SDIST_SHA256,
    'setuptools-80.9.0-py3-none-any.whl',
    '062d34222ad13e0cc312a4c02d73f059e86a4acbfbdea8f8f76b28c99f306922',
    'wheel-0.45.1-py3-none-any.whl',
    '708e7481cc80179af0e556bbf0cc00b8444c7321e2700b8d8580231d13017248',
    PYTHON_HOSTLIST_BUILD_LOCK_SHA256,
    PYTHON_HOSTLIST_BUILD_SCRIPT_SHA256,
    PYTHON_HOSTLIST_VERIFIER_SHA256,
    'for derived_output in "$SOURCE_BUILD_A" "$SOURCE_BUILD_B"',
    '--network=none',
    '--read-only',
    '--user="$(id -u):$(id -g)"',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges=true',
    '--pids-limit=64',
    '--ulimit nofile=256:256',
    '--ulimit fsize=16777216:16777216',
    '--mount "type=bind,src=$SOURCE_BUILD_INPUTS,dst=/inputs,readonly"',
    '--mount "type=bind,src=$derived_output,dst=/output"',
    'cmp --silent',
  ]) || nprocUlimitPattern.test(sourceBuild)
      || sourceBuild.includes('$GITHUB_WORKSPACE')
      || sourceBuild.includes('src=$WHEELHOUSE')) {
    failures.push(`${prefix} the source-only python-hostlist dependency must be hash-pinned and built twice in networkless builders without workspace or runtime-wheelhouse access.`);
  }
  const coldInstall = runSteps.get('Prove a cold, hash-locked install with no network')?.run ?? '';
  if (!hasAll(coldInstall, [
    '--network=none',
    '--pids-limit=256',
    'PIP_NO_INDEX=1',
    '--no-index',
    '--require-hashes',
    '--only-binary=:all:',
    'startup_hook=/tmp/cold-venv/lib/python3.12/site-packages/distutils-precedence.pth',
    SETUPTOOLS_STARTUP_HOOK_SHA256,
    'rm -- "$startup_hook"',
    'test ! -e "$startup_hook"',
    'unexpected_hooks="$(find /tmp/cold-venv/lib/python3.12/site-packages',
    '-mindepth 1 -maxdepth 1',
    '\\( -type f -o -type l -o -type d \\)',
    '-iname \\*.pth',
    '-iname sitecustomize -o -iname sitecustomize.\\*',
    '-iname usercustomize -o -iname usercustomize.\\*',
    'test -z "$unexpected_hooks"',
    '/tmp/cold-venv/bin/python -I -m pip check',
  ])) failures.push(`${prefix} cold install must remain hash-locked, offline and remove the one byte-pinned setuptools startup hook before Python restarts.`);
  const inventoryVerifierFragments = [
    ATOMISTIC_RUNTIME_INVENTORY_VERIFIER_SHA256,
    'scripts/atomistic/verify_runtime_inventory.py',
    'python3 -I -S -B scripts/atomistic/verify_runtime_inventory.py',
    '--wheelhouse "$WHEELHOUSE"',
    '--manifest "$LOCK_DIR/$MODEL.wheelhouse.manifest.json"',
  ];
  const freeze = runSteps.get('Freeze and verify the exact resolved wheel set')?.run ?? '';
  if (!hasAll(freeze, [
    ...inventoryVerifierFragments,
    ATOMISTIC_RUNTIME_INPUT_CONTRACT_SHA256,
    'scripts/atomistic/runtime-input-contract.mjs verify-exact',
    '--output "$LOCK_DIR/$MODEL.runtime-inputs.json"',
    '"$ATOMISTIC_ROOT/$MODEL.runtime-inputs.result.json"',
    '"$ATOMISTIC_ROOT/$MODEL.runtime-inputs.verify.json"',
    'RUNTIME_INPUT_MANIFEST_DIGEST',
  ])) {
    failures.push(`${prefix} frozen wheelhouse verification must independently recompute raw and post-removal install inventories.`);
  }
  const resolve = runSteps.get('Resolve an exact lock from the offline wheelhouse')?.run ?? '';
  if (!hasAll(resolve, [
    '--network=none',
    'derived_manifest="$MANIFEST_DIR/python-hostlist.derived-wheel.manifest.json"',
    'derived_mount=(--mount "type=bind,src=$MANIFEST_DIR,dst=/manifests,readonly")',
    'derived_arguments=(--derived-wheel-manifest /manifests/python-hostlist.derived-wheel.manifest.json)',
    '"${derived_mount[@]}"',
    '"${derived_arguments[@]}"',
    ATOMISTIC_RUNTIME_INPUT_CONTRACT_SHA256,
    'scripts/atomistic/runtime-input-contract.mjs write-new',
    '--runner-source-root "$RUNTIME_SOURCE_ROOT"',
    '--runner-build-root "$BUILD_CONTEXT"',
    '--runtime-source-revision "$RUNTIME_SOURCE_REVISION"',
    '--source-date-epoch "$SOURCE_DATE_EPOCH"',
    '--output "$runtime_input_manifest"',
    'RUNTIME_INPUT_MANIFEST_DIGEST=',
  ])) failures.push(`${prefix} MACE resolution must bind the verified derived-wheel provenance inside the offline resolver.`);
  const bind = runSteps.get('Bind paths and runner constants from the frozen plan')?.run ?? '';
  if (!hasAll(bind, [
    ATOMISTIC_RUNTIME_DISCOVERY_LOCK_SHA256,
    ATOMISTIC_RUNTIME_SOURCE_REVISION,
    String(ATOMISTIC_RUNTIME_SOURCE_DATE_EPOCH),
    ATOMISTIC_SOURCE_MANIFEST_DIGEST,
    ATOMISTIC_MATERIALIZATION_DIGEST,
    "runtimeLock.state !== 'discovery-not-frozen'",
    "runtimeLock.schemaVersion !== 'tf.atomistic-runtime-lock/0.2'",
    'runtimeLock.runtimeSource?.runtimeSourceRevision !== expectedRuntimeSourceRevision',
    'canonicalJson(runtimeLock.runtimeSource?.files)',
    'canonicalJson(runtimeLock.runtimeSource?.materializations)',
    'runtimeLock.claims?.promotionEligible !== false',
    'runtimeLock.claims?.comparable !== false',
    'runtimeLock.claims?.reproduced !== false',
    "execFileSync('git', ['cat-file', '-e'",
    "execFileSync('git', ['merge-base', '--is-ancestor'",
    "GIT_CONFIG_NOSYSTEM: '1'",
    "GIT_CONFIG_SYSTEM: '/dev/null'",
    "GIT_CONFIG_GLOBAL: '/dev/null'",
    "GIT_NO_REPLACE_OBJECTS: '1'",
    'gitBlobOid(bytes) !== source.gitBlobOid',
    'const runtimeSourceRoot = realpathSync(process.env.RUNTIME_SOURCE_ROOT)',
    'const buildContext = realpathSync(process.env.BUILD_CONTEXT)',
    "throw new Error('Runtime source and build roots must be disjoint.')",
    'writeExclusiveRegular(runtimeSourceRoot, source.path, bytes, source.sha256)',
    'writeExclusiveRegular(buildContext, buildPath, sourceBytes.get(source.path), source.sha256)',
    'readBoundedRegularFile(target, bytes.length, 0o444)',
    "'.dockerignore'",
    '`atomistic/containers/${process.env.MODEL}.Dockerfile`',
    'sourceBytes.size !== 5 || selectedBuildSources.size !== 4 || buildPaths.size !== 4',
    'RUNTIME_SOURCE_REVISION: expectedRuntimeSourceRevision',
    'SOURCE_DATE_EPOCH: String(expectedSourceDateEpoch)',
    ...ATOMISTIC_SELECTED_SOURCE_FILES.flatMap((source) => Object.values(source).map(String)),
    ...ATOMISTIC_RUNTIME_MATERIALIZATIONS.flatMap((mapping) => Object.values(mapping).map(String)),
  ])
      || bind.includes('$GITHUB_WORKSPACE/scripts/atomistic/run_model.py')
      || bind.includes('$GITHUB_WORKSPACE/scripts/atomistic/runtime_contract.py')) {
    failures.push(`${prefix} runtime binding must verify and materialize the exact five P blobs into disjoint read-only roots without reading or overwriting tracked R5 paths.`);
  }
  const directories = runSteps.get('Create fresh, model-isolated working directories')?.run ?? '';
  if (!hasAll(directories, [
    'test -n "${RUNNER_TEMP:-}"',
    'test ! -L "$RUNNER_TEMP"',
    'publish_dir="$RUNNER_TEMP/tailing-atomistic-publish/$MODEL"',
    'runtime_source_root="$task_root/runtime-source"',
    '"$structure_dir" "$inference_input_dir" "$runtime_source_root" "$build_context"',
    'echo "RUNTIME_SOURCE_ROOT=$runtime_source_root"',
    'echo "PUBLISH_DIR=$publish_dir"',
  ])) failures.push(`${prefix} publish and isolated runtime-source roots must be derived from the trusted runner temp inside the first shell step.`);
  const build = runSteps.get('Build the isolated runtime image with no build-step network')?.run ?? '';
  if (!hasAll(build, [
    'docker buildx build',
    'BUILDX_METADATA_PROVENANCE=disabled',
    '--network=none',
    '--platform=linux/amd64',
    '--build-context "wheelhouse=$WHEELHOUSE"',
    'image_tag="tailing-atomistic-$MODEL-bootstrap:$GITHUB_SHA"',
    '--build-arg "SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH"',
    '--label org.opencontainers.image.revision="$RUNTIME_SOURCE_REVISION"',
    '--metadata-file "$BUILD_CONTEXT/$MODEL.buildx-metadata.json"',
    'bootstrap-not-reproduced',
    ATOMISTIC_RUNTIME_INPUT_CONTRACT_SHA256,
    'scripts/atomistic/runtime-input-contract.mjs verify-exact',
    'runtime-inputs.build-context.verify.json',
    '--runner-source-root "$RUNTIME_SOURCE_ROOT"',
    '--runner-build-root "$BUILD_CONTEXT"',
    ATOMISTIC_CONTAINER_OBSERVATION_WRITER_SHA256,
    'scripts/atomistic/write-container-observation.mjs write-new',
    'scripts/atomistic/write-container-observation.mjs verify-exact',
    '--workflow-revision "$GITHUB_SHA"',
    '--runtime-input-manifest "$LOCK_DIR/$MODEL.runtime-inputs.json"',
    '--output "$BUILD_CONTEXT/$MODEL.container-observation.json"',
    SETUPTOOLS_RUNTIME_WHEEL_FILENAME,
    SETUPTOOLS_STARTUP_HOOK_SHA256,
    'runtimeInstalledFileCount !== manifest.installedFileCount - 1',
    "versions.pymatgen !== '2025.4.17'",
    "versions['pymatgen-io-validation'] !== '0.1.2'",
    "Object.hasOwn(versions, 'pymatgen-core')",
    'test -f "$BUILD_CONTEXT/.dockerignore"',
    'test -f "$BUILD_CONTEXT/atomistic/containers/$MODEL.Dockerfile"',
    'test "$(stat -c \'%a\' "$materialized")" = 444',
    "'./.dockerignore'",
    '"./atomistic/containers/$MODEL.Dockerfile"',
    '"./atomistic/locks/$MODEL.requirements.lock"',
    "'./scripts/atomistic/run_model.py'",
    "'./scripts/atomistic/runtime_contract.py'",
    'test "$actual_context_files" = "$expected_context_files"',
    ...inventoryVerifierFragments,
  ])) failures.push(`${prefix} Docker build must remain Linux/amd64, offline, bound to the private wheelhouse and to the exact startup-hook removal plan.`);
  const inference = runSteps.get('Run checkpoint deserialization and smoke predictions in the final sandbox')?.run ?? '';
  const inferenceEnvironmentFlags = inference.match(/--env\s+"[^"]+"/g) ?? [];
  if (!hasAll(inference, [
    'docker run --rm --platform=linux/amd64',
    '--network=none',
    '--read-only',
    '--user=65532:65532',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges=true',
    '--pids-limit=256',
    '--mode smoke',
    '--env "TAILING_ATOMISTIC_WORKFLOW_REVISION=$GITHUB_SHA"',
    '--env "TAILING_ATOMISTIC_RUNTIME_SOURCE_REVISION=$RUNTIME_SOURCE_REVISION"',
    '--env "TAILING_ATOMISTIC_DOCKER_LOCAL_CONFIG_IMAGE_ID=$DOCKER_LOCAL_CONFIG_IMAGE_ID"',
  ])
      || inferenceEnvironmentFlags.length !== 3
      || inference.includes('TAILING_ATOMISTIC_CONTAINER_DIGEST')
      || inference.includes('--env "GITHUB_SHA=')) {
    failures.push(`${prefix} checkpoint inference must remain an offline, read-only, non-root Linux/amd64 smoke sandbox with only the three reviewed provenance variables.`);
  }
  const staging = runSteps.get('Stage only non-promotional bootstrap outputs')?.run ?? '';
  if (!hasAll(staging, [
    'scripts/atomistic/write_bootstrap_outcome.py',
    ATOMISTIC_BOOTSTRAP_OUTCOME_SCRIPT_SHA256,
    '--model "$MODEL"',
    '--commit-sha "$GITHUB_SHA"',
    '--run-id "$GITHUB_RUN_ID"',
    '--run-attempt "$GITHUB_RUN_ATTEMPT"',
    '--publish-root "$PUBLISH_DIR"',
    '--stage "guard=$STAGE_GUARD"',
    '--stage "directories=$STAGE_DIRECTORIES"',
    '--stage "bind=$STAGE_BIND"',
    '--stage "base=$STAGE_BASE"',
    '--stage "assets=$STAGE_ASSETS"',
    '--stage "structures=$STAGE_STRUCTURES"',
    '--stage "wheelhouse=$STAGE_WHEELHOUSE"',
    '--stage "resolve=$STAGE_RESOLVE"',
    '--stage "freeze=$STAGE_FREEZE"',
    '--stage "cold-install=$STAGE_COLD_INSTALL"',
    '--stage "build=$STAGE_BUILD"',
    '--stage "inference=$STAGE_INFERENCE"',
    'wheelhouse.get("derivedWheelProvenance", {}).get("manifestDigest")',
    'staged derived-wheel provenance differs from the resolver binding',
    '"$LOCK_DIR/$MODEL.runtime-inputs.json" "$PUBLISH_DIR/manifests/$MODEL.runtime-inputs.json"',
    '"$BUILD_CONTEXT/$MODEL.container-observation.json" "$PUBLISH_DIR/manifests/$MODEL.container-observation.json"',
    '"$BUILD_CONTEXT/$MODEL.buildx-metadata.json" "$PUBLISH_DIR/diagnostics/$MODEL.buildx-metadata.json"',
    '"$BUILD_CONTEXT/$MODEL.image-inspect.json" "$PUBLISH_DIR/diagnostics/$MODEL.image-inspect.json"',
    '"$BUILD_CONTEXT/buildx-version.txt" "$PUBLISH_DIR/diagnostics/$MODEL.buildx-version.txt"',
    '"$BUILD_CONTEXT/docker-server-version.txt" "$PUBLISH_DIR/diagnostics/$MODEL.docker-server-version.txt"',
  ])) failures.push(`${prefix} staging must publish one run-bound, ordered non-promotional outcome manifest.`);
  if (/(^|[^a-z])(metrics?|receipts?|attest(?:ation)?)([^a-z]|$)/i.test(executable)
      || /evidence-class=(?!bootstrap-not-reproduced)/.test(executable)
      || /REPRODUCED_MODEL_CARD_PROTOCOL|ENGINEERING_BASELINE_COMPLETE/.test(executable)) {
    failures.push(`${prefix} bootstrap executable may not compute metrics, receipts, attestations or promotional result classes.`);
  }
  return failures;
}

export function inspectAtomisticBootstrapVerifyWorkflow(workflow) {
  const failures = [];
  const prefix = `${ATOMISTIC_BOOTSTRAP_VERIFY_WORKFLOW_PATH}:`;
  const readOnlyPermissions = { contents: 'read', actions: 'read' };
  const attestPermissions = {
    contents: 'read',
    actions: 'read',
    'id-token': 'write',
    attestations: 'write',
    'artifact-metadata': 'write',
  };
  const receiptArtifactName = 'tailing-atomistic-bootstrap-replica-receipt-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}';
  const receiptSourcePath = '${{ runner.temp }}/tailing-atomistic-bootstrap-replica-receipt/atomistic-bootstrap-replica-receipt.json';
  const receiptAttestDirectory = '${{ runner.temp }}/tailing-atomistic-bootstrap-replica-attest';
  const receiptAttestPath = `${receiptAttestDirectory}/atomistic-bootstrap-replica-receipt.json`;

  if (!sameJson(Object.keys(workflow).sort(), ['concurrency', 'jobs', 'name', 'on', 'permissions'])) {
    failures.push(`${prefix} workflow contains an unreviewed top-level key.`);
  }
  if (workflow.name !== 'Atomistic bootstrap replica verifier (non-promotional)') {
    failures.push(`${prefix} workflow name must preserve the bootstrap-only non-promotional boundary.`);
  }
  if (!sameJson(workflow.on, {
    workflow_dispatch: {
      inputs: {
        run_id_1: {
          description: 'First approved bootstrap workflow run ID',
          required: true,
          type: 'string',
        },
        run_id_2: {
          description: 'Second approved bootstrap workflow run ID',
          required: true,
          type: 'string',
        },
      },
    },
  })) failures.push(`${prefix} verifier must have only two required string workflow_dispatch inputs.`);
  if (!sameJson(workflow.permissions, readOnlyPermissions)) {
    failures.push(`${prefix} workflow permissions must remain read-only without OIDC or attestation authority.`);
  }
  if (!sameJson(workflow.concurrency, {
    group: 'atomistic-bootstrap-verify-${{ inputs.run_id_1 }}-${{ inputs.run_id_2 }}',
    'cancel-in-progress': false,
  })) failures.push(`${prefix} concurrency must bind both approved source run IDs.`);

  const jobs = workflow.jobs && typeof workflow.jobs === 'object' && !Array.isArray(workflow.jobs) ? workflow.jobs : {};
  if (!sameJson(Object.keys(jobs), ['verify', 'attest'])) {
    failures.push(`${prefix} verifier must contain only the separated verify and attest jobs.`);
  }

  const verify = jobs.verify;
  if (!verify || typeof verify !== 'object' || Array.isArray(verify)) {
    failures.push(`${prefix} read-only verify job is missing.`);
  } else {
    if (!sameJson(Object.keys(verify).sort(), ['name', 'outputs', 'permissions', 'runs-on', 'steps', 'timeout-minutes'].sort())) {
      failures.push(`${prefix} verify job contains an unreviewed key.`);
    }
    if (verify.name !== 'Verify approved bootstrap replicas without promotion authority'
        || verify['runs-on'] !== 'ubuntu-24.04' || verify['timeout-minutes'] !== 30) {
      failures.push(`${prefix} verify must remain a bounded Ubuntu 24.04 job.`);
    }
    if (!sameJson(verify.permissions, readOnlyPermissions)) {
      failures.push(`${prefix} verify job must have only contents: read and actions: read.`);
    }
    if (!sameJson(verify.outputs, {
      receipt_artifact_name: '${{ steps.receipt.outputs.receipt_artifact_name }}',
      receipt_sha256: '${{ steps.receipt.outputs.receipt_sha256 }}',
      receipt_size_bytes: '${{ steps.receipt.outputs.receipt_size_bytes }}',
    })) failures.push(`${prefix} verify job outputs must bind the reviewed receipt name, raw digest, and size.`);

    const steps = Array.isArray(verify.steps) ? verify.steps : [];
    const expectedNames = [
      'Check out the protected-main verifier without credentials',
      'Install the pinned JavaScript runtime',
      'Refuse unapproved runs or a verifier outside protected main',
      'Install locked verifier dependencies without lifecycle scripts',
      'Verify both replicas and create one canonical bootstrap-only receipt',
      'Upload only the canonical bootstrap replica receipt',
    ];
    if (!sameJson(steps.map((step) => step?.name), expectedNames)) {
      failures.push(`${prefix} verify step set or order drifted.`);
    }
    if (!sameJson(steps[0], {
      name: expectedNames[0],
      uses: ATOMISTIC_BOOTSTRAP_VERIFY_CHECKOUT_ACTION,
      with: { ref: '${{ github.sha }}', 'persist-credentials': false, 'fetch-depth': 0 },
    })) failures.push(`${prefix} verifier checkout must bind the dispatched main SHA with full ancestry and no credentials.`);
    if (!sameJson(steps[1], {
      name: expectedNames[1],
      uses: ATOMISTIC_BOOTSTRAP_VERIFY_SETUP_NODE_ACTION,
      with: { 'node-version': ATOMISTIC_BOOTSTRAP_VERIFY_NODE_VERSION },
    })) failures.push(`${prefix} verifier Node action or exact runtime drifted.`);

    const guard = steps[2];
    if (!guard || guard.shell !== 'bash'
        || !sameJson(Object.keys(guard).sort(), ['env', 'name', 'run', 'shell'])
        || !sameJson(guard.env, { RUN_ID_1: '${{ inputs.run_id_1 }}', RUN_ID_2: '${{ inputs.run_id_2 }}' })
        || typeof guard.run !== 'string'
        || sha256(guard.run) !== ATOMISTIC_BOOTSTRAP_VERIFY_RUN_DIGESTS[expectedNames[2]]) {
      failures.push(`${prefix} protected-main and approved-run guard program drifted.`);
    } else if (!hasAll(guard.run, [
      'test "$GITHUB_REF" = "refs/heads/main"',
      'test "$GITHUB_REF_PROTECTED" = "true"',
      'git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main',
      'test "$RUN_ID_1" = "33242996794"',
      'test "$RUN_ID_2" = "33242999376"',
      'test "$RUN_ID_1" != "$RUN_ID_2"',
    ])) failures.push(`${prefix} guard must fail closed outside protected main or the exact two approved runs.`);

    const install = steps[3];
    if (!install || install.name !== expectedNames[3] || install.shell !== 'bash'
        || !sameJson(Object.keys(install).sort(), ['name', 'run', 'shell'])
        || typeof install.run !== 'string'
        || sha256(install.run) !== ATOMISTIC_BOOTSTRAP_VERIFY_RUN_DIGESTS[expectedNames[3]]) {
      failures.push(`${prefix} locked dependency installation program drifted.`);
    }

    const receipt = steps[4];
    if (!receipt || receipt.id !== 'receipt' || receipt.shell !== 'bash'
        || !sameJson(Object.keys(receipt).sort(), ['env', 'id', 'name', 'run', 'shell'].sort())
        || !sameJson(receipt.env, {
          GITHUB_TOKEN: '${{ github.token }}',
          RUN_ID_1: '${{ inputs.run_id_1 }}',
          RUN_ID_2: '${{ inputs.run_id_2 }}',
          RECEIPT_PATH: receiptSourcePath,
          RECEIPT_ARTIFACT_NAME: receiptArtifactName,
          MAX_RECEIPT_BYTES: '1048576',
        })
        || typeof receipt.run !== 'string'
        || sha256(receipt.run) !== ATOMISTIC_BOOTSTRAP_VERIFY_RUN_DIGESTS[expectedNames[4]]) {
      failures.push(`${prefix} controlled verifier invocation or raw receipt binding drifted.`);
    } else if (!hasAll(receipt.run, [
      'scripts/atomistic/verify-bootstrap-replicas.mjs',
      '--run-id-1 "$RUN_ID_1"',
      '--run-id-2 "$RUN_ID_2"',
      '--output "$RECEIPT_PATH"',
      'receipt_sha256="sha256:$(sha256sum -- "$RECEIPT_PATH"',
    ]) || receipt.run.includes('set -x')) failures.push(`${prefix} verifier must consume the token only through the environment and publish only bounded receipt metadata.`);

    if (!sameJson(steps[5], {
      name: expectedNames[5],
      uses: ATOMISTIC_BOOTSTRAP_VERIFY_UPLOAD_ACTION,
      with: {
        name: '${{ steps.receipt.outputs.receipt_artifact_name }}',
        path: receiptSourcePath,
        'if-no-files-found': 'error',
        'include-hidden-files': false,
        overwrite: false,
        'retention-days': 7,
      },
    })) failures.push(`${prefix} receipt upload action, exact path, name, or bounded retention drifted.`);
  }

  const attest = jobs.attest;
  if (!attest || typeof attest !== 'object' || Array.isArray(attest)) {
    failures.push(`${prefix} isolated attest job is missing.`);
  } else {
    if (!sameJson(Object.keys(attest).sort(), ['name', 'needs', 'permissions', 'runs-on', 'steps', 'timeout-minutes'].sort())) {
      failures.push(`${prefix} attest job contains an unreviewed key.`);
    }
    if (attest.name !== 'Attest the verified receipt bytes without repository execution'
        || attest.needs !== 'verify' || attest['runs-on'] !== 'ubuntu-24.04' || attest['timeout-minutes'] !== 10) {
      failures.push(`${prefix} attest must remain a bounded Ubuntu 24.04 job that needs verify.`);
    }
    if (!sameJson(attest.permissions, attestPermissions)) {
      failures.push(`${prefix} attest job permissions must be the exact read, OIDC, attestation, and artifact-metadata set.`);
    }
    const steps = Array.isArray(attest.steps) ? attest.steps : [];
    const expectedNames = [
      'Create a clean receipt download directory',
      'Download the exact receipt artifact from this verifier run',
      'Match the single downloaded receipt to the verify job bytes',
      'Attest only the verified bootstrap replica receipt',
    ];
    if (!sameJson(steps.map((step) => step?.name), expectedNames)) {
      failures.push(`${prefix} attest step set or order drifted.`);
    }
    if (steps.some((step) => String(step?.uses ?? '').startsWith('actions/checkout@')
        || String(step?.uses ?? '').startsWith('./')
        || (typeof step?.run === 'string' && /(?:^|[\s"'])scripts\//m.test(step.run)))) {
      failures.push(`${prefix} attest job may not check out or execute repository code.`);
    }
    const prepare = steps[0];
    if (!prepare || prepare.shell !== 'bash'
        || !sameJson(Object.keys(prepare).sort(), ['env', 'name', 'run', 'shell'])
        || !sameJson(prepare.env, { RECEIPT_DIR: receiptAttestDirectory })
        || typeof prepare.run !== 'string'
        || sha256(prepare.run) !== ATOMISTIC_BOOTSTRAP_VERIFY_RUN_DIGESTS[expectedNames[0]]) {
      failures.push(`${prefix} clean attest directory program drifted.`);
    }
    if (!sameJson(steps[1], {
      name: expectedNames[1],
      uses: ATOMISTIC_BOOTSTRAP_VERIFY_DOWNLOAD_ACTION,
      with: {
        name: '${{ needs.verify.outputs.receipt_artifact_name }}',
        path: receiptAttestDirectory,
        'github-token': '${{ github.token }}',
        repository: '${{ github.repository }}',
        'run-id': '${{ github.run_id }}',
      },
    })) failures.push(`${prefix} receipt download must use the exact artifact name, repository, and current verifier run.`);
    const match = steps[2];
    if (!match || match.shell !== 'bash'
        || !sameJson(Object.keys(match).sort(), ['env', 'name', 'run', 'shell'])
        || !sameJson(match.env, {
          RECEIPT_DIR: receiptAttestDirectory,
          RECEIPT_PATH: receiptAttestPath,
          SOURCE_ARTIFACT_NAME: '${{ needs.verify.outputs.receipt_artifact_name }}',
          EXPECTED_RECEIPT_SHA256: '${{ needs.verify.outputs.receipt_sha256 }}',
          EXPECTED_RECEIPT_SIZE_BYTES: '${{ needs.verify.outputs.receipt_size_bytes }}',
          MAX_RECEIPT_BYTES: '1048576',
        })
        || typeof match.run !== 'string'
        || sha256(match.run) !== ATOMISTIC_BOOTSTRAP_VERIFY_RUN_DIGESTS[expectedNames[2]]) {
      failures.push(`${prefix} single-file raw receipt size and digest verifier drifted.`);
    }
    if (!sameJson(steps[3], {
      name: expectedNames[3],
      uses: ATOMISTIC_BOOTSTRAP_VERIFY_ATTEST_ACTION,
      with: {
        'subject-path': receiptAttestPath,
        'show-summary': false,
        'github-token': '${{ github.token }}',
      },
    })) failures.push(`${prefix} attest must be last and bind only the verified receipt subject path.`);
  }
  return failures;
}

export function inspectOpenMmTip3pProtectedWorkflow(workflow, source = undefined) {
  const failures = [];
  const prefix = `${OPENMM_TIP3P_PROTECTED_WORKFLOW_PATH}:`;
  const readOnlyPermissions = { contents: 'read', actions: 'read' };
  const attestPermissions = {
    contents: 'read',
    actions: 'read',
    'id-token': 'write',
    attestations: 'write',
    'artifact-metadata': 'write',
  };
  const artifactName = '${{ steps.stage.outputs.artifact_name }}';
  const artifactRoot = '${{ env.ARTIFACT_ROOT }}';
  const expectedArtifactFiles = [
    'buildx-version.txt',
    'container-create-inspect.json',
    'container-final-inspect.json',
    'docker-version.txt',
    'image-inspect.json',
    'openmm-ci-acquisition-manifest.json',
    'openmm-tip3p-control-receipt.json',
    'openmm-tip3p-protected-browser-evidence.json',
    'openmm-tip3p-protected-ci-evidence.json',
  ];

  if (source !== undefined
      && sha256(source) !== `sha256:${OPENMM_TIP3P_PROTECTED_WORKFLOW_SHA256}`) {
    failures.push(`${prefix} complete reviewed workflow bytes drifted.`);
  }
  if (!sameJson(Object.keys(workflow).sort(), ['concurrency', 'jobs', 'name', 'on', 'permissions'])) {
    failures.push(`${prefix} workflow contains an unreviewed top-level key.`);
  }
  if (workflow.name !== 'OpenMM TIP3P protected control') {
    failures.push(`${prefix} workflow name drifted.`);
  }
  if (!sameJson(workflow.on, { workflow_dispatch: null })) {
    failures.push(`${prefix} protected control must be manual workflow_dispatch only.`);
  }
  if (!sameJson(workflow.permissions, readOnlyPermissions)) {
    failures.push(`${prefix} root permissions must remain read-only without attestation authority.`);
  }
  if (!sameJson(workflow.concurrency, {
    group: 'openmm-tip3p-protected-${{ github.ref }}-${{ github.sha }}',
    'cancel-in-progress': false,
  })) failures.push(`${prefix} concurrency must bind the protected ref and exact source SHA.`);

  const jobs = workflow.jobs && typeof workflow.jobs === 'object' && !Array.isArray(workflow.jobs)
    ? workflow.jobs : {};
  if (!sameJson(Object.keys(jobs), ['execute', 'attest'])) {
    failures.push(`${prefix} only the separated execute and attest jobs are allowed.`);
  }
  const execute = jobs.execute;
  if (!execute || typeof execute !== 'object' || Array.isArray(execute)) {
    failures.push(`${prefix} execute job is missing.`);
  } else {
    if (!sameJson(Object.keys(execute).sort(), [
      'env', 'name', 'outputs', 'permissions', 'runs-on', 'steps', 'timeout-minutes',
    ].sort())) failures.push(`${prefix} execute job contains an unreviewed key.`);
    if (execute.name !== 'Produce and independently verify private OpenMM evidence'
        || execute['runs-on'] !== 'ubuntu-24.04'
        || execute['timeout-minutes'] !== 350) {
      failures.push(`${prefix} execute must remain the bounded Ubuntu 24.04 lane.`);
    }
    if (!sameJson(execute.permissions, readOnlyPermissions)) {
      failures.push(`${prefix} execute job may have only contents/actions read.`);
    }
    if (!sameJson(execute.outputs, {
      artifact_name: '${{ steps.bind.outputs.artifact_name }}',
      artifact_id: '${{ steps.bind.outputs.artifact_id }}',
      artifact_digest: '${{ steps.bind.outputs.artifact_digest }}',
      envelope_sha256: '${{ steps.stage.outputs.envelope_sha256 }}',
      envelope_size_bytes: '${{ steps.stage.outputs.envelope_size_bytes }}',
    })) failures.push(`${prefix} execute outputs must bind the immutable artifact and envelope bytes.`);
    if (!sameJson(execute.env, {
      BASE_IMAGE_INDEX: 'python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7',
      BASE_IMAGE_INDEX_DIGEST: 'sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7',
      BASE_IMAGE: 'python:3.12.11-slim-bookworm@sha256:c00fc7b44d844b6da22861ec24af43968a5200eac4ec607b4725d585165d6b49',
      BASE_IMAGE_PLATFORM_DIGEST: 'sha256:c00fc7b44d844b6da22861ec24af43968a5200eac4ec607b4725d585165d6b49',
      BASE_REPOSITORY_DIGEST: 'python@sha256:c00fc7b44d844b6da22861ec24af43968a5200eac4ec607b4725d585165d6b49',
      DOCKERFILE_FRONTEND: PINNED_DOCKERFILE_FRONTEND,
      DOCKERFILE_FRONTEND_DIGEST: 'sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e',
      IMAGE_TAG: 'tailing/openmm-tip3p:${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}',
      CONTAINER_NAME: 'tailing-openmm-tip3p-${{ github.run_id }}-${{ github.run_attempt }}',
      CHROMIUM_ACQUISITION_ROOT: '/opt/tailing-private-chromium-acquisition-${{ github.run_id }}-${{ github.run_attempt }}',
      BROWSER_RUNTIME_ROOT: '/opt/tailing-private-chromium-${{ github.run_id }}-${{ github.run_attempt }}',
      BROWSER_SOURCE_ROOT: '/opt/tailing-private-openmm-source-${{ github.run_id }}-${{ github.run_attempt }}',
      BROWSER_CONTROL_ROOT: '/opt/tailing-private-openmm-control-${{ github.run_id }}-${{ github.run_attempt }}',
      BROWSER_RECEIPT_ROOT: '/opt/tailing-private-browser-receipts-${{ github.run_id }}-${{ github.run_attempt }}',
      BROWSER_NODE_ROOT: '/opt/tailing-private-node-${{ github.run_id }}-${{ github.run_attempt }}',
      BROWSER_ROLLDOWN_ROOT: '/opt/tailing-private-rolldown-${{ github.run_id }}-${{ github.run_attempt }}',
      BROWSER_APPARMOR_PROFILE: 'tailing-future-chromium-${{ github.run_id }}-${{ github.run_attempt }}',
      BROWSER_APPARMOR_PROFILE_PATH: '/etc/apparmor.d/tailing-future-chromium-${{ github.run_id }}-${{ github.run_attempt }}',
    })) failures.push(`${prefix} execute image trust roots or private/public path split drifted.`);

    const steps = Array.isArray(execute.steps) ? execute.steps : [];
    const expectedNames = [
      'Check out the protected-main source without credentials',
      'Install the pinned JavaScript runtime',
      'Bind runner-scoped private paths',
      'Refuse dispatch outside protected main Linux x86_64',
      'Install locked verifier dependencies without lifecycle scripts',
      'Create isolated private acquisition and execution roots',
      'Acquire the five locked OpenMM inputs and wheels',
      'Acquire the exact locked private Chromium archive',
      'Safely extract the exact locked private Chromium runtime',
      'Freeze and verify the exact locked private Chromium runtime',
      'Freeze the exact Node and Rolldown browser runtime dependencies',
      'Prefetch the pinned base image and record the Docker toolchain',
      'Build the OpenMM image with build-step network disabled',
      'Create the hardened offline producer container',
      'Start and wait for the private producer',
      'Independently verify the complete private producer output',
      'Require the exact independently verified-pass receipt',
      'Freeze the verified OpenMM source and control receipt for private browser modes',
      'Load and canary the exact Chromium AppArmor userns profile',
      'Run the three protected private browser modes',
      'Compose the sanitized protected browser evidence',
      'Unload AppArmor profile and remove every private browser execution root',
      'Write the sanitized protected-CI evidence envelope',
      'Stage only the nine allowlisted evidence files',
      'Upload only the allowlisted protected-CI evidence',
      'Bind the immutable GitHub artifact identity',
    ];
    if (!sameJson(steps.map((step) => step?.name), expectedNames)) {
      failures.push(`${prefix} execute step set or order drifted.`);
    }
    if (!sameJson(steps[0], {
      name: expectedNames[0],
      uses: ATOMISTIC_BOOTSTRAP_VERIFY_CHECKOUT_ACTION,
      with: { ref: '${{ github.sha }}', 'persist-credentials': false, 'fetch-depth': 0 },
    })) failures.push(`${prefix} protected source checkout drifted.`);
    if (!sameJson(steps[1], {
      name: expectedNames[1],
      uses: ATOMISTIC_BOOTSTRAP_VERIFY_SETUP_NODE_ACTION,
      with: { 'node-version': ATOMISTIC_BOOTSTRAP_VERIFY_NODE_VERSION },
    })) failures.push(`${prefix} execute Node runtime drifted.`);

    const runSteps = new Map();
    for (const step of steps) {
      if (typeof step?.run !== 'string') continue;
      const allowedKeys = step.name === 'Unload AppArmor profile and remove every private browser execution root'
        ? ['id', 'if', 'name', 'run', 'shell']
        : ['env', 'id', 'name', 'run', 'shell'];
      if (step.shell !== 'bash'
          || !Object.keys(step).every((key) => allowedKeys.includes(key))
          || runSteps.has(step.name)) {
        failures.push(`${prefix} execute run step keys, shell, or uniqueness drifted.`);
      }
      runSteps.set(step.name, step);
    }
    const cleanup = runSteps.get('Unload AppArmor profile and remove every private browser execution root');
    if (cleanup?.id !== 'browser_cleanup' || cleanup?.if !== 'always()'
        || !sameJson(Object.keys(cleanup ?? {}).sort(), [
          'id', 'if', 'name', 'run', 'shell',
        ].sort())) {
      failures.push(`${prefix} private browser cleanup must always run as the reviewed gate.`);
    }
    for (const name of expectedNames.filter((name) => Object.hasOwn(
      OPENMM_TIP3P_PROTECTED_RUN_DIGESTS, name,
    ))) {
      const step = runSteps.get(name);
      if (!step || sha256(step.run) !== OPENMM_TIP3P_PROTECTED_RUN_DIGESTS[name]) {
        failures.push(`${prefix} reviewed execute program drifted: ${name}.`);
      }
    }
    const executable = [...runSteps.values()].map((step) => step.run).join('\n');
    if (/--no-sandbox|--disable-setuid-sandbox|chmod\s+0?4755|(?:echo|printf)[^\n]*\b0\b[^\n]*apparmor_restrict_unprivileged_userns|sysctl[^\n]*apparmor_restrict_unprivileged_userns[^\n]*=\s*0/u.test(executable)) {
      failures.push(`${prefix} Chromium sandbox or global AppArmor userns restriction was weakened.`);
    }
    if (!hasAll(executable, [
      'test "$GITHUB_REF" = "refs/heads/main"',
      'test "$GITHUB_REF_PROTECTED" = "true"',
      'test "$(realpath -- "$RUNNER_TEMP")" = "$RUNNER_TEMP"',
      "printf 'PRIVATE_ROOT=%s/tailing-openmm-tip3p-private\\n' \"$RUNNER_TEMP\"",
      '} >> "$GITHUB_ENV"',
      'test "$GITHUB_WORKFLOW_SHA" = "$GITHUB_SHA"',
      'test "$GITHUB_RUN_ATTEMPT" = "1"',
      'test "$(git rev-parse refs/remotes/origin/main^{commit})" = "$GITHUB_SHA"',
      'fetch-ci-assets.mjs',
      '--manifest "$EVIDENCE_ROOT/openmm-ci-acquisition-manifest.json"',
      'docker buildx imagetools inspect "$BASE_IMAGE_INDEX" --raw',
      'docker buildx imagetools inspect "$DOCKERFILE_FRONTEND" --raw',
      '--network none',
      '--read-only',
      '--cap-drop ALL',
      '--security-opt no-new-privileges=true',
      '--pids-limit 128',
      '--memory 8g',
      '--memory-swap 8g',
      '--cpus 2',
      '--platform linux/amd64',
      '--mount "type=bind,src=$INPUT_ROOT,dst=/inputs,readonly"',
      '--mount "type=bind,src=$PRODUCER_OUTPUT,dst=/work/output"',
      'verify-control-cli.mjs',
      "receipt.status !== 'verified-pass'",
      'receipt.gates?.allPassed !== true',
      'receipt.claims?.scientificPass !== true',
      'fetch-private-chromium-v049.mjs',
      'safe_extract_private_chromium_v049.py',
      'freeze-private-chromium-runtime-v049.py',
      '--runtime-root "$BROWSER_RUNTIME_ROOT"',
      '--execute',
      '/opt/hostedtoolcache/node/24.16.0/x64/bin/node',
      '@rolldown/binding-linux-x64-gnu/rolldown-binding.linux-x64-gnu.node',
      'ae16856655924ebc41f231393c7f8b89566430a845d1f073fd9d6abf219db04b',
      '0:0:444:1:19324672',
      'run-protected-browser-namespace-v049.sh',
      'apparmor_restrict_unprivileged_userns',
      'grep -Eq -- "^$BROWSER_APPARMOR_PROFILE \\\\([^)]*\\\\)$"',
      '/usr/sbin/apparmor_parser --add --skip-cache',
      '/usr/bin/aa-exec --profile="$BROWSER_APPARMOR_PROFILE" --',
      '/usr/bin/unshare --user --map-root-user /bin/true',
      '/usr/sbin/apparmor_parser --remove --skip-cache',
      'sudo rm -f -- "$profile_source"',
      '--mode happy-path',
      '--mode mid-playback-dispose',
      '--mode context-loss',
      'compose-protected-browser-evidence-v049.mjs',
      '--output "$EVIDENCE_ROOT/openmm-tip3p-protected-browser-evidence.json"',
      'sudo rm -rf -- "$private_root"',
      'write-ci-evidence.mjs',
      'test "$(find "$ARTIFACT_ROOT" -mindepth 1 -maxdepth 1 -type f -links 1 -printf x | wc -c)" -eq 9',
    ])) failures.push(`${prefix} protected-main, private browser, cleanup, or nine-file staging guard is incomplete.`);
    const browserModes = runSteps.get('Run the three protected private browser modes')?.run ?? '';
    const sharedSession = '--session-id "v049-openmm-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"';
    if (browserModes.split(sharedSession).length !== 4) {
      failures.push(`${prefix} all three browser modes must bind the same exact world-session identity.`);
    }

    const upload = steps.find((step) => step?.name
      === 'Upload only the allowlisted protected-CI evidence');
    const expectedUploadPath = `${expectedArtifactFiles.map((name) => `${artifactRoot}/${name}`).join('\n')}\n`;
    if (!sameJson(upload, {
      name: 'Upload only the allowlisted protected-CI evidence',
      id: 'upload',
      uses: ATOMISTIC_BOOTSTRAP_VERIFY_UPLOAD_ACTION,
      with: {
        name: artifactName,
        path: expectedUploadPath,
        'if-no-files-found': 'error',
        'include-hidden-files': false,
        overwrite: false,
        'retention-days': 7,
      },
    })) failures.push(`${prefix} upload must contain only the exact nine sanitized evidence files.`);
    if (typeof upload?.with?.path === 'string'
        && /PRODUCER_OUTPUT|INPUT_ROOT|WHEELHOUSE|\.pdb|\.xml|arrays\//.test(upload.with.path)) {
      failures.push(`${prefix} raw inputs, wheels, coordinates, parameters, or arrays may not be uploaded.`);
    }
  }

  const attest = jobs.attest;
  if (!attest || typeof attest !== 'object' || Array.isArray(attest)) {
    failures.push(`${prefix} attest job is missing.`);
  } else {
    if (!sameJson(Object.keys(attest).sort(), [
      'name', 'needs', 'permissions', 'runs-on', 'steps', 'timeout-minutes',
    ].sort())) failures.push(`${prefix} attest job contains an unreviewed key.`);
    if (attest.name !== 'Validate downloaded evidence and attest only the envelope'
        || attest.needs !== 'execute'
        || attest['runs-on'] !== 'ubuntu-24.04'
        || attest['timeout-minutes'] !== 15) {
      failures.push(`${prefix} attest must remain a bounded job dependent on execute.`);
    }
    if (!sameJson(attest.permissions, attestPermissions)) {
      failures.push(`${prefix} attest permissions drifted from the exact read/OIDC/attestation set.`);
    }
    const steps = Array.isArray(attest.steps) ? attest.steps : [];
    const expectedNames = [
      'Refuse attestation outside this protected run and create a clean download root',
      'Install the pinned JavaScript runtime without repository checkout',
      'Download the exact allowlisted evidence artifact from this run',
      'Verify every downloaded evidence file and envelope binding',
      'Attest only the verified sanitized evidence envelope',
    ];
    if (!sameJson(steps.map((step) => step?.name), expectedNames)) {
      failures.push(`${prefix} attest step set or order drifted.`);
    }
    const attestPaths = {
      DOWNLOAD_ROOT: '${{ runner.temp }}/tailing-openmm-tip3p-attest',
      ENVELOPE_PATH: '${{ runner.temp }}/tailing-openmm-tip3p-attest/openmm-tip3p-protected-ci-evidence.json',
    };
    if (!sameJson(steps[0]?.env, attestPaths)
        || !sameJson(steps[3]?.env, {
          ...attestPaths,
          EXPECTED_ARTIFACT_NAME: '${{ needs.execute.outputs.artifact_name }}',
          EXPECTED_ARTIFACT_ID: '${{ needs.execute.outputs.artifact_id }}',
          EXPECTED_ARTIFACT_DIGEST: '${{ needs.execute.outputs.artifact_digest }}',
          EXPECTED_ENVELOPE_SHA256: '${{ needs.execute.outputs.envelope_sha256 }}',
          EXPECTED_ENVELOPE_SIZE_BYTES: '${{ needs.execute.outputs.envelope_size_bytes }}',
          GITHUB_TOKEN: '${{ github.token }}',
        })) failures.push(`${prefix} attest step-scoped download and subject paths drifted.`);
    if (steps.some((step) => String(step?.uses ?? '').startsWith('actions/checkout@')
        || String(step?.uses ?? '').startsWith('./')
        || (typeof step?.run === 'string' && /(?:^|[\s"'])scripts\//m.test(step.run)))) {
      failures.push(`${prefix} privileged attest job may not check out or execute repository code.`);
    }
    if (!sameJson(steps[1], {
      name: expectedNames[1],
      uses: ATOMISTIC_BOOTSTRAP_VERIFY_SETUP_NODE_ACTION,
      with: { 'node-version': ATOMISTIC_BOOTSTRAP_VERIFY_NODE_VERSION },
    })) failures.push(`${prefix} attest Node runtime drifted.`);
    if (!sameJson(steps[2], {
      name: expectedNames[2],
      uses: ATOMISTIC_BOOTSTRAP_VERIFY_DOWNLOAD_ACTION,
      with: {
        name: '${{ needs.execute.outputs.artifact_name }}',
        path: '${{ runner.temp }}/tailing-openmm-tip3p-attest',
        'github-token': '${{ github.token }}',
        repository: '${{ github.repository }}',
        'run-id': '${{ github.run_id }}',
      },
    })) failures.push(`${prefix} attest download must bind the exact current-run artifact.`);
    for (const index of [0, 3]) {
      const step = steps[index];
      if (!step || step.shell !== 'bash'
          || !Object.keys(step).every((key) => ['env', 'name', 'run', 'shell'].includes(key))
          || sha256(step.run) !== OPENMM_TIP3P_PROTECTED_RUN_DIGESTS[step.name]) {
        failures.push(`${prefix} reviewed attest validation program drifted: ${step?.name ?? index}.`);
      }
    }
    const verifyProgram = typeof steps[3]?.run === 'string' ? steps[3].run : '';
    if (!hasAll(verifyProgram, [
      'downloaded artifact does not contain the exact nine-file allowlist',
      'envelope.files.length !== expectedSourceFiles.length',
      "records.get('openmm-tip3p-protected-browser-evidence.json')",
      'browser evidence is not exact canonical JSON plus LF',
      'browser evidence has a stale self digest',
      'canonicalJson(Object.keys(browser).sort())',
      'outerControlDigestKeys.some',
      "envelope.controlReceipt.status !== 'verified-pass'",
      "browser.sourceRevision !== process.env.GITHUB_SHA",
      'canonicalJson(expectedBrowserControlReceipt)',
      'browserSourceDigestKeys.some',
      'canonicalJson(browser.browserRuntime) !== canonicalJson(expectedBrowserRuntime)',
      'canonicalJson(Object.keys(browser.client).sort())',
      'browser.modeResults.length !== expectedBrowserModes.length',
      'observationDigests.size !== expectedBrowserModes.length',
      'mode.browserDrawObserved !== expected.browserDrawObserved',
      'mode.trajectoryCompleted !== expected.trajectoryCompleted',
      'mode.renderedFrameCount !== expected.renderedFrameCount',
      'canonicalJson(browser.isolation) !== canonicalJson(expectedBrowserIsolation)',
      'canonicalJson(browser.crossMode) !== canonicalJson(expectedBrowserCrossMode)',
      'canonicalJson(browser.cleanup) !== canonicalJson(expectedBrowserCleanup)',
      'canonicalJson(browser.claims) !== canonicalJson(expectedBrowserClaims)',
      'canonicalJson(envelope.browserEvidence)',
      "envelope.schemaVersion !== 'tf.openmm-tip3p-protected-ci-evidence/0.4.9'",
      "'accept-encoding': 'identity'",
      "contentEncoding.trim().toLowerCase() !== 'identity'",
      'metadataSize > maximumMetadataBytes',
      'metadata.digest !== process.env.EXPECTED_ARTIFACT_DIGEST',
      "metadata.workflow_run?.head_branch !== 'main'",
      'metadata.workflow_run?.head_sha !== process.env.GITHUB_SHA',
    ])) failures.push(`${prefix} attester must independently bind all files, the envelope, and GitHub artifact metadata.`);
    if (!sameJson(steps[4], {
      name: expectedNames[4],
      uses: ATOMISTIC_BOOTSTRAP_VERIFY_ATTEST_ACTION,
      with: {
        'subject-path': '${{ runner.temp }}/tailing-openmm-tip3p-attest/openmm-tip3p-protected-ci-evidence.json',
        'show-summary': false,
        'github-token': '${{ github.token }}',
      },
    })) failures.push(`${prefix} attestation must be last and cover only the sanitized envelope.`);
  }
  return failures;
}

export function inspectDockerfileSource(relativePath, source) {
  const failures = [];
  const expectedSourceDigest = ATOMISTIC_DOCKERFILE_DIGESTS[relativePath];
  if (expectedSourceDigest && `sha256:${createHash('sha256').update(source).digest('hex')}` !== expectedSourceDigest) {
    failures.push(`${relativePath}: complete reviewed Dockerfile bytes drifted.`);
  }
  const expectedDirective = `# syntax=${PINNED_DOCKERFILE_FRONTEND}`;
  if (source.split(/\r?\n/, 1)[0] !== expectedDirective) failures.push(`${relativePath}: Dockerfile frontend must equal ${PINNED_DOCKERFILE_FRONTEND}.`);
  const args = [...source.matchAll(/^\s*ARG\s+([^\s=]+)(?:=(\S+))?\s*$/gmi)];
  const baseArgs = args.filter((match) => match[1] === 'BASE_IMAGE');
  if (relativePath === 'atomistic/containers/openmm-water.Dockerfile') {
    if (baseArgs.length !== 0) failures.push(`${relativePath}: the OpenMM control must keep its exact in-source base digest and no BASE_IMAGE argument.`);
  } else if (baseArgs.length !== 1 || baseArgs[0][2] !== undefined) {
    failures.push(`${relativePath}: ARG BASE_IMAGE must be declared exactly once without a mutable default.`);
  }

  const stageAliases = new Set();
  const fromReferences = [...source.matchAll(/^\s*FROM(?:\s+--platform=\S+)?\s+([^\s]+)(?:\s+AS\s+([A-Za-z0-9_.-]+))?\s*$/gmi)];
  if (!fromReferences.length) failures.push(`${relativePath}: Dockerfile has no FROM instruction.`);
  for (const [, reference, alias] of fromReferences) {
    if (reference !== '${BASE_IMAGE}' && reference !== 'scratch' && !immutableOciReference(reference)) failures.push(`${relativePath}: FROM ${reference} is not an allowed pinned base reference.`);
    if (alias) stageAliases.add(alias);
  }
  for (const match of source.matchAll(/^\s*COPY\s+--from=([^\s]+)\s+/gmi)) {
    const reference = match[1];
    if (reference !== 'wheelhouse' && !stageAliases.has(reference) && !immutableOciReference(reference)) failures.push(`${relativePath}: COPY --from=${reference} is not a declared stage, wheelhouse context or digest-pinned image.`);
  }
  for (const match of source.matchAll(/^\s*RUN\b([^\n]*)/gmi)) {
    if (!/^\s+--network=none(?:\s|$)/.test(match[1])) failures.push(`${relativePath}: every RUN instruction must declare --network=none.`);
    if (/--mount=type=(?:secret|ssh)\b/i.test(match[1])) failures.push(`${relativePath}: RUN secret and SSH mounts are forbidden.`);
  }
  if (/^atomistic\/containers\/(?:mace|mattersim)\.Dockerfile$/.test(relativePath) && !hasAll(source, [
    'startup_hook=/opt/tailing-venv/lib/python3.12/site-packages/distutils-precedence.pth',
    SETUPTOOLS_STARTUP_HOOK_SHA256,
    'rm -- "$startup_hook"',
    'test ! -e "$startup_hook"',
    'unexpected_hooks="$(find /opt/tailing-venv/lib/python3.12/site-packages',
    '-mindepth 1 -maxdepth 1',
    '\\( -type f -o -type l -o -type d \\)',
    "-iname '*.pth' -o -iname sitecustomize -o -iname 'sitecustomize.*'",
    "-o -iname usercustomize -o -iname 'usercustomize.*'",
    'test -z "$unexpected_hooks"',
    '/opt/tailing-venv/bin/python -I -m pip check',
    'RUN --network=none unexpected_hooks="$(find /opt/tailing-venv/lib/python3.12/site-packages',
  ])) failures.push(`${relativePath}: runtime must verify and remove the exact setuptools startup hook before the next venv interpreter starts.`);
  if (/^\s*ADD\s+https?:\/\//gmi.test(source)) failures.push(`${relativePath}: remote ADD is forbidden.`);
  return failures;
}

export function inspectDockerignoreSource(relativePath, source) {
  const lines = source.endsWith('\n') ? source.slice(0, -1).split('\n') : [];
  return JSON.stringify(lines) === JSON.stringify(DOCKERIGNORE_ALLOWLIST)
    ? []
    : [`${relativePath}: atomistic build context must use the exact deny-all allowlist.`];
}

function immutableOciReference(reference) {
  return /^[A-Za-z0-9${}._/:+\-[\]]+@sha256:[0-9a-f]{64}$/.test(reference);
}

function hasAll(value, fragments) {
  return fragments.every((fragment) => value.includes(fragment));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasObjectCycle(root) {
  const active = new WeakSet();
  const complete = new WeakSet();
  const stack = [{ exit: false, value: root }];
  while (stack.length) {
    const { exit, value } = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (exit) {
      active.delete(value);
      complete.add(value);
      continue;
    }
    if (active.has(value)) return true;
    if (complete.has(value)) continue;
    active.add(value);
    stack.push({ exit: true, value });
    const children = Array.isArray(value) ? value : Object.values(value);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ exit: false, value: children[index] });
    }
  }
  return false;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function walk(value, visitor) {
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, visitor);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    visitor(key, child);
    walk(child, visitor);
  }
}
