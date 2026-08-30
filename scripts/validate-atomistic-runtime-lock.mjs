import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  RUNTIME_LOCK_PATH,
  RUNTIME_LOCK_SCHEMA_PATH,
  parseJsonRejectingDuplicateMembers,
  validateAtomisticRuntimeLock,
} from './atomistic/runtime-lock-policy.mjs';

const root = process.cwd();
const failures = [];

try {
  const [lockBytes, schemaBytes] = await Promise.all([
    readFile(path.join(root, RUNTIME_LOCK_PATH)),
    readFile(path.join(root, RUNTIME_LOCK_SCHEMA_PATH)),
  ]);
  const result = await validateAtomisticRuntimeLock(lockBytes, { root });
  failures.push(...result.failures);

  if (result.lock) {
    try {
      const schema = parseJsonRejectingDuplicateMembers(schemaBytes);
      const ajv = new Ajv2020({ allErrors: true, validateFormats: false });
      const validate = ajv.compile(schema);
      if (!validate(result.lock)) failures.push(`runtime-lock.schema: ${JSON.stringify(validate.errors)}`);
    } catch (error) {
      failures.push(`runtime-lock.schema: unable to load or compile (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (!failures.length) {
    console.log(`Atomistic runtime lock: VALID · ${result.lock.state} · ${result.lock.replication.acceptedProtectedMainReplicas}/2 accepted protected-main replicas · BOOTSTRAP RUNTIME FROZEN — NOT SCIENTIFICALLY REPRODUCED`);
  }
} catch (error) {
  failures.push(`runtime-lock: validation could not start (${error instanceof Error ? error.message : String(error)})`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
