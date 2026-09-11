'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { compareDynamicsBranches, COMPARISON_UNITS } from '@/lib/structure/custom-ar-branch-comparison';
import type { DynamicsSession } from '@/lib/structure/custom-ar-dynamics-session';

const cellStyle: CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--custom-line, rgba(24, 91, 70, .17))', textAlign: 'left', verticalAlign: 'top' };
const quantityStyle: CSSProperties = { ...cellStyle, position: 'sticky', left: 0, zIndex: 1, color: 'var(--custom-ink, #15352b)', background: '#fcfefb', overflowWrap: 'anywhere', boxShadow: '1px 0 rgba(24, 91, 70, .25)' };
const valueStyle: CSSProperties = { ...cellStyle, fontFamily: 'var(--font-geist-mono)', fontVariantNumeric: 'tabular-nums', overflowWrap: 'normal', wordBreak: 'normal' };

function ComparisonTable({ caption, label, columns, headers, testId, children }: Readonly<{ caption: string; label: string; columns: number[]; headers: string[]; testId?: string; children: ReactNode }>) {
  return <div role="region" aria-label={label} tabIndex={0} style={{ minWidth: 0, maxWidth: '100%', overflowX: 'auto', border: '1px solid var(--custom-line, rgba(24, 91, 70, .17))', marginBlock: 12 }}>
    <table data-testid={testId} style={{ width: columns.reduce((sum, width) => sum + width, 0), tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--custom-ink, #15352b)', background: '#fcfefb' }}>
      <caption style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--custom-ink, #15352b)', background: '#fcfefb' }}>{caption}</caption>
      <colgroup>{columns.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
      <thead><tr>{headers.map((header, index) => <th key={header} scope="col" style={index === 0 ? quantityStyle : { ...cellStyle, whiteSpace: 'nowrap' }}>{header}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>;
}

export function CustomArBranchComparison({ session, selectedAtomId }: Readonly<{ session: DynamicsSession; selectedAtomId: string | null }>) {
  const [aIndex, setAIndex] = useState('');
  const [bIndex, setBIndex] = useState('');
  const a = aIndex === '' ? null : session.history[Number(aIndex)];
  const b = bIndex === '' ? null : session.history[Number(bIndex)];
  const outcome = a && b ? compareDynamicsBranches(session, a, b) : null;
  const comparison = outcome?.comparison;
  const selected = comparison?.atoms.find(atom => atom.atomId === selectedAtomId);
  return <section aria-label="Accepted branch comparison" style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }}>
    <h3>Accepted branch comparison · B − A</h3>
    <p>Differences between accepted exploratory model states. Neutral Ar, finite nonperiodic force-shift Lennard–Jones only. No causal effects, experimental results or calibrated predictions; coordinate forks do not inherit numerical qualification.</p>
    {(['A', 'B'] as const).map(role => <label key={role}>{role === 'A' ? 'A: unedited continuation' : 'B: coordinate-fork continuation'}<select aria-label={`Comparison endpoint ${role}`} value={role === 'A' ? aIndex : bIndex} onChange={event => (role === 'A' ? setAIndex : setBIndex)(event.target.value)}>
      <option value="">Choose retained endpoint explicitly</option>
      {session.history.map((state, index) => <option key={`${index}-${state.stateDigest}`} value={index}>{index}: {state.physical.timeFs} fs · {state.stateDigest.slice(0, 19)}</option>)}
    </select></label>)}
    {outcome?.decision === 'abstain' && <output data-testid="branch-comparison-abstention">{JSON.stringify(outcome)}</output>}
    {comparison && <div data-testid="branch-comparison-result">
      <p>Each table scrolls horizontally independently. Focus a table region and use the left/right arrow keys; quantity labels stay visible. All numeric digits are retained.</p>
      <p>Verified common retained parent: {comparison.sources.parent}</p>
      <p>A state: {comparison.sources.a}; physical: {comparison.sources.aPhysical}</p>
      <p>B state: {comparison.sources.b}; physical: {comparison.sources.bPhysical}</p>
      <p>Exact common time: {comparison.timeFs} fs; tick {comparison.tick}; step {comparison.dtTicks} source ticks.</p>
      <p>Endpoint energy units: kJ/mol; dimension energy/amount; basis per mole identical finite systems.</p>
      <ComparisonTable label="Endpoint energy comparison, horizontal scroll" caption="Endpoint energy · kJ/mol · energy/amount · per mole identical finite systems" columns={[100, 220, 220, 220]} headers={['Quantity', 'A', 'B', 'B − A']}>
        {Object.entries(comparison.energy).map(([name, value]) => <tr key={name}><th scope="row" style={quantityStyle}>{name.toUpperCase()}</th><td style={valueStyle}>{value.a}</td><td style={valueStyle}>{value.b}</td><td style={valueStyle}>{value.delta}</td></tr>)}
      </ComparisonTable>
      <p>Coordinate-fork ΔH for B: {comparison.branchDiagnostics.b.deltaH} kJ/mol. This coordinate-edit discontinuity is not work and is separate from endpoint H difference.</p>
      <p>Branch maximum |H−H₀|: A {comparison.branchDiagnostics.a.maxEnergyDrift}; B {comparison.branchDiagnostics.b.maxEnergyDrift} kJ/mol; energy/amount, per mole identical finite systems. These stored branch diagnostics may include history before the common parent; identity forks preserve their inherited baseline.</p>
      {selected ? <ComparisonTable label="Selected atom vector comparison, horizontal scroll" testId="branch-comparison-atom" caption={`Selected stable atom: ${selected.atomId}; components in x, y, z order`} columns={[185, 220, 220, 220]} headers={['Quantity / unit / dimension / basis', 'A', 'B', 'B − A']}>
        {(['position', 'velocity', 'force'] as const).map(kind => <tr key={kind}><th scope="row" style={quantityStyle}>{kind}: {COMPARISON_UNITS[kind].unit}; {COMPARISON_UNITS[kind].dimension}; {COMPARISON_UNITS[kind].basis}</th><td style={valueStyle}>{selected[kind].a.join(', ')}</td><td style={valueStyle}>{selected[kind].b.join(', ')}</td><td style={valueStyle}>{selected[kind].delta.join(', ')}</td></tr>)}
      </ComparisonTable> : <p>Select a stable atom in the structure to inspect its paired vectors.</p>}
      <ComparisonTable label="Maximum component differences, horizontal scroll" caption="Maximum absolute component differences · ties use stable ID then x, y, z" columns={[185, 220, 150, 75]} headers={['Quantity / unit', '|B − A|', 'Atom ID', 'Axis']}>
        {(['position', 'velocity', 'force'] as const).map(kind => { const value = comparison.maximumAbsoluteComponentDifference[kind]; return <tr key={kind}><th scope="row" style={quantityStyle}>{kind} ({COMPARISON_UNITS[kind].unit})</th><td style={valueStyle}>{value.value}</td><td style={{ ...cellStyle, overflowWrap: 'anywhere' }}>{value.atomId}</td><td style={valueStyle}>{value.axis}</td></tr>; })}
      </ComparisonTable>
      <p>Force-arrow normalization is independent per frame; arrow lengths are not cross-frame magnitude measurements.</p>
      <details><summary>Comparison model, source units, dimensions and bases</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ model: comparison.model, parameters: comparison.parameters, sourceUnits: comparison.sourceUnits, comparisonUnits: comparison.units, coordinateFrame: comparison.coordinateFrame, boundary: comparison.boundary }, null, 2)}</pre></details>
    </div>}
  </section>;
}
