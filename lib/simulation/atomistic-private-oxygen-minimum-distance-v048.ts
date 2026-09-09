/**
 * Internal O-O presentation-geometry scan. Input: finite oxygen anchors already
 * wrapped by ((v % 3) + 3) % 3, in nanometers (dimension L), in the fixed 3 nm
 * periodic cubic cell. Output: minimum-image separation in nanometers.
 * The caller retains all validation and rejection rules; this is no density,
 * equilibrium, execution-authenticity or physical-validity assessment.
 *
 * Axis pruning assumes unmodified Math intrinsics in Node 24.16.0 / V8
 * 13.6.233.17-node.49. Its three-argument normalized hypot retains the maximum
 * absolute component as a lower bound on this wrapped grid. Version selection
 * declares applicability, not runtime authentication or an all-engine proof.
 * Unknown runtimes retain the original complete hypot scan.
 */
export function minimumWrappedOxygenDistanceNanometerV048(
  oxygenAnchors: ReadonlyArray<readonly [number, number, number]>,
): number {
  const canPrune = typeof process !== 'undefined' && process !== null
    && process.versions?.node === '24.16.0'
    && process.versions?.v8 === '13.6.233.17-node.49';
  let minimumOxygenDistance = Number.POSITIVE_INFINITY;
  for (let left = 0; left < oxygenAnchors.length; left += 1) {
    for (let right = left + 1; right < oxygenAnchors.length; right += 1) {
      const dx = minimumImage(oxygenAnchors[right][0] - oxygenAnchors[left][0]);
      const dy = minimumImage(oxygenAnchors[right][1] - oxygenAnchors[left][1]);
      const dz = minimumImage(oxygenAnchors[right][2] - oxygenAnchors[left][2]);
      // Equality is evaluated. A component one ULP greater may be pruned.
      if (canPrune && (Math.abs(dx) > minimumOxygenDistance
        || Math.abs(dy) > minimumOxygenDistance
        || Math.abs(dz) > minimumOxygenDistance)) continue;
      minimumOxygenDistance = Math.min(minimumOxygenDistance, Math.hypot(dx, dy, dz));
    }
  }
  return minimumOxygenDistance;
}

function minimumImage(value: number) {
  return value - 3 * Math.round(value / 3);
}
