// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CustomStructureWorkbench } from '../../app/components/custom-structure-workbench';
import { AR_INTERPRETATION, exportCheckpoint, initialize, restoreCheckpoint, type State } from './ar-vv-adapter';
import { createDefaultStructureDraft, exportStructureNativeJson, finalizeStructureDocument, makeFiniteNetCharge } from './structure-document';
import type { projectDynamicsState } from './custom-ar-dynamics-session';
import * as radial from '../simulation/periodic-potentials';

type Projection = ReturnType<typeof projectDynamicsState>;
let observed: { model: Projection['model']; forceOverlay: Projection['overlay'] | null; physicalDigest: string | null };
vi.mock('../../app/components/custom-structure-webgl', () => ({
  CustomStructureWebgl: (props: typeof observed & { onAtomSelect: (id: string) => void }) => {
    observed = props;
    return React.createElement('button', { onClick: () => props.onAtomSelect(props.model.atoms.at(-1)!.id), 'data-testid': 'dynamics-mock-webgl', 'data-physical-digest': props.physicalDigest }, 'Inspect last dynamics atom');
  },
}));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
function fixture() {
  const draft = createDefaultStructureDraft(); draft.finiteSystem!.netCharge = makeFiniteNetCharge(0);
  draft.atoms = [[0, 0, 0], [4.1, 0, 0], [0, 4.2, 0.1]].map((p, i) => ({ id: `ui-${i}`, element: { atomicNumber: 18, symbol: 'Ar' }, position: { x: p[0], y: p[1], z: p[2] }, formalCharge: null, isotope: null }));
  const document = finalizeStructureDocument(draft);
  return { document, velocities: draft.atoms.map((atom, i) => ({ atomId: atom.id, velocity: [i * 0.00001, 0, 0] })), dtTicks: 2, confirmation: AR_INTERPRETATION };
}
function control<T = HTMLInputElement>(name: string): T { return container.querySelector(`[aria-label="${name}"]`) as T; }
function button(text: string) { const b = [...container.querySelectorAll('button')].find(b => b.textContent === text); if (!b) throw new Error(`missing ${text}`); return b; }
function click(text: string) { act(() => button(text).click()); }
function change(name: string, value: string) {
  const element = control<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(name);
  act(() => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function checkbox(name: string) { act(() => control<HTMLInputElement>(name).click()); }
function bytesFile(bytes: Uint8Array, name: string) {
  const file = new File([bytes.buffer as ArrayBuffer], name);
  Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: async () => bytes.buffer }); return file;
}
async function load(file: File, checkpoint = false) {
  const input = checkpoint ? control<HTMLInputElement>('Stage dynamics checkpoint') : container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
const digest = () => container.querySelector('[data-testid="dynamics-physical-digest"]')?.textContent;
async function ready() {
  const input = fixture();
  await load(bytesFile(exportStructureNativeJson(input.document), 'fixture.tfstructure.json'));
  change('Initial velocity selection', 'manual');
  change('Initial velocities JSON', JSON.stringify(input.velocities));
  checkbox('Confirm exploratory dynamics'); click('Initialize Ar dynamics'); return input;
}
async function exported(): Promise<State> {
  let blob: Blob | undefined;
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((value: Blob) => { blob = value; return 'blob:dynamics'; }) });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  click('Export selected dynamics checkpoint');
  const text = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob!); });
  return restoreCheckpoint(Uint8Array.from(new TextEncoder().encode(text)));
}
it('requires explicit velocities/consent and binds advance, selected atom and export to the same accepted state', async () => {
  const input = fixture();
  const spy = vi.spyOn(radial, 'evaluateForceShiftedRadialPotential');
  await load(bytesFile(exportStructureNativeJson(input.document), 'fixture.tfstructure.json'));
  expect(spy).not.toHaveBeenCalled(); expect(button('Initialize Ar dynamics').disabled).toBe(true);
  checkbox('Confirm exploratory dynamics'); expect(button('Initialize Ar dynamics').disabled).toBe(true);
  change('Initial velocity selection', 'manual'); change('Initial velocities JSON', JSON.stringify(input.velocities));
  expect(button('Initialize Ar dynamics').disabled).toBe(true);
  checkbox('Confirm exploratory dynamics'); click('Initialize Ar dynamics');
  expect(digest()).toBe(initialize(input).physicalDigest);
  change('Dynamics steps', '3'); click('Advance accepted state');
  const state = await exported();
  expect(digest()).toBe(state.physicalDigest);
  expect(observed.physicalDigest).toBe(state.physicalDigest);
  expect(observed.forceOverlay?.physicalDigest).toBe(state.physicalDigest);
  expect(container.querySelector('[data-testid="dynamics-readouts"]')?.getAttribute('data-physical-digest')).toBe(state.physicalDigest);
  for (const site of state.physical.sites) {
    expect(observed.model.atoms.find(a => a.id === site.atomId)?.exactPositionAngstrom).toEqual(site.position);
    expect(observed.forceOverlay?.vectors.find(a => a.atomId === site.atomId)?.start).toEqual(site.position);
  }
  const calls = spy.mock.calls.length; click('Inspect last dynamics atom'); expect(spy.mock.calls.length).toBe(calls);
  const last = state.physical.sites.at(-1)!;
  expect(container.querySelector('[data-testid="selected-dynamics-position"]')?.textContent).toContain(last.position.join(' / '));
  expect(container.querySelector('[data-testid="selected-dynamics-velocity"]')?.textContent).toContain(last.velocity.join(' / '));
  expect(container.querySelector('[data-testid="selected-dynamics-force"]')?.textContent).toContain(last.force.join(' / '));
});
it('stages with zero calls, ignores serialized consent and preserves prior accepted state on tampered replay', async () => {
  await ready(); const before = digest(), state = await exported();
  const packet = JSON.parse(new TextDecoder().decode(exportCheckpoint(state))); packet.state.physical.ke += 1;
  const spy = vi.spyOn(radial, 'evaluateForceShiftedRadialPotential');
  await load(bytesFile(new TextEncoder().encode(JSON.stringify(packet)), 'bad.tf-ar-dynamics.json'), true);
  expect(spy).not.toHaveBeenCalled(); expect(digest()).toBe(before);
  expect(button('Replay & restore dynamics checkpoint').disabled).toBe(true);
  checkbox('Confirm full checkpoint replay'); click('Replay & restore dynamics checkpoint');
  expect(digest()).toBe(before); expect(container.querySelector('[data-testid="dynamics-abstention"]')?.textContent).toContain('abstain');
  expect(control<HTMLInputElement>('Confirm full checkpoint replay').checked).toBe(false);
  await load(bytesFile(exportCheckpoint(state), 'good.tf-ar-dynamics (2).json'), true);
  expect(button('Replay & restore dynamics checkpoint').disabled).toBe(true);
  checkbox('Confirm full checkpoint replay'); click('Replay & restore dynamics checkpoint');
  expect(digest()).toBe(before); expect(control<HTMLInputElement>('Confirm exploratory dynamics').checked).toBe(false);
});
it('changes the next initialization draft without changing the accepted integration step', async () => {
  const input = await ready();
  const original = await exported();
  expect(original.physical.dtTicks).toBe(2);
  const spy = vi.spyOn(radial, 'evaluateForceShiftedRadialPotential');
  change('Dynamics time step', '1');
  expect(button('Advance accepted state').disabled).toBe(true);
  checkbox('Confirm exploratory dynamics');
  expect(spy).not.toHaveBeenCalled();
  expect(container.querySelector('[data-testid="dynamics-initialization-scope"]')?.textContent).toContain('They do not modify an accepted state');
  click('Advance accepted state');
  const advanced = await exported();
  expect(advanced.physical.dtTicks).toBe(2);
  expect(advanced.physical.tick).toBe(2);
  expect(advanced.physical.timeFs).toBe(0.25);
  expect(container.querySelector('[data-testid="dynamics-readouts"]')?.textContent).toContain('actual step 0.25 fs');
  click('Initialize Ar dynamics');
  const reinitialized = await exported();
  expect(reinitialized.physical.dtTicks).toBe(1);
  expect(reinitialized.physical.tick).toBe(0);
  expect(reinitialized.physical.timeFs).toBe(0);
  expect(reinitialized.physical.sites.map(site => site.position)).toEqual(advanced.physical.sites.map(site => site.position));
  expect(reinitialized.physical.sites.map(site => ({ atomId: site.atomId, velocity: [...site.velocity] }))).toEqual(input.velocities);
});
it('keeps history full-state-only and transactional fork/advance failures retain parent while edits invalidate derived data', async () => {
  await ready(); const parent = await exported();
  change('Dynamics steps', '401'); click('Advance accepted state'); expect(digest()).toBe(parent.physicalDigest);
  change('Coordinate fork JSON', '[{"atomId":"ui-0","position":[0,4.2,0.1]}]'); click('Fork accepted coordinates'); expect(digest()).toBe(parent.physicalDigest);
  change('Coordinate fork JSON', '[{"atomId":"ui-0","position":[0.005,0,0]}]'); click('Fork accepted coordinates');
  const child = await exported(); expect(child.branch.parentStateDigest).toBe(parent.stateDigest); expect(child.physical.ke).toBe(parent.physical.ke);
  expect(child.branch.deltaHIsWork).toBe(false);
  change('Accepted dynamics history', '0'); expect(digest()).toBe(parent.physicalDigest); expect(button('Advance accepted state').disabled).toBe(true);
  click('Resume selected accepted state'); change('Coordinate fork JSON', '[]'); click('Fork accepted coordinates');
  expect(control<HTMLSelectElement>('Accepted dynamics history').options.length).toBe(3); expect(digest()).toBe(parent.physicalDigest);
  change('x coordinate for atom 1', '0.01'); expect(digest()).toBeUndefined(); expect(observed.forceOverlay).toBeNull(); expect(button('Initialize Ar dynamics').disabled).toBe(true);
});
for (const invalidation of ['edit', 'format', 'hide', 'unmount', 'newer']) for (const ending of ['resolve', 'reject']) it(`ignores stale checkpoint ${ending} after ${invalidation}`, async () => {
  await ready(); const bytes = exportCheckpoint(initialize(fixture()));
  let resolve!: (bytes: ArrayBuffer) => void, reject!: (error: Error) => void;
  const file = bytesFile(bytes, 'pending.tf-ar-dynamics.json');
  Object.defineProperty(file, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>((yes, no) => { resolve = yes; reject = no; }) });
  await load(file, true);
  if (invalidation === 'edit') change('x coordinate for atom 1', '0.2');
  if (invalidation === 'format') change('Import format', 'xyz');
  if (invalidation === 'hide') act(() => root.render(React.createElement(CustomStructureWorkbench, { active: false, onBack: vi.fn() })));
  if (invalidation === 'unmount') act(() => root.render(null));
  if (invalidation === 'newer') await load(bytesFile(bytes, 'newer.tf-ar-dynamics.json'), true);
  const text = container.textContent, current = digest();
  await act(async () => { if (ending === 'resolve') resolve(bytes.buffer as ArrayBuffer); else reject(new Error('stale checkpoint error')); });
  expect(container.textContent).toBe(text); expect(digest()).toBe(current);
});
it('compares explicit retained endpoints, follows the selected atom and clears on reinitialization and generic edit', async () => {
  await ready();
  change('Dynamics steps', '2'); click('Advance accepted state'); click('Advance accepted state');
  change('Accepted dynamics history', '1'); click('Resume selected accepted state');
  click('Fork accepted coordinates'); click('Advance accepted state');
  const before = digest(), history = control<HTMLSelectElement>('Accepted dynamics history').value;
  const spy = vi.spyOn(radial, 'evaluateForceShiftedRadialPotential');
  change('Comparison endpoint A', '2'); change('Comparison endpoint B', '4');
  expect(container.querySelector('[data-testid="branch-comparison-result"]')?.textContent).toContain('Exact common time: 1 fs');
  act(() => (container.querySelector('[data-testid="dynamics-mock-webgl"]') as HTMLButtonElement).click());
  expect(container.querySelector('[data-testid="branch-comparison-atom"]')?.textContent).toContain('ui-2');
  expect(spy).not.toHaveBeenCalled(); expect(digest()).toBe(before); expect(control<HTMLSelectElement>('Accepted dynamics history').value).toBe(history);
  click('Initialize Ar dynamics');
  expect(control<HTMLSelectElement>('Comparison endpoint A').value).toBe('');
  expect(container.querySelector('[data-testid="branch-comparison-result"]')).toBeNull();
  change('x coordinate for atom 1', '0.01');
  expect(container.querySelector('[aria-label="Accepted branch comparison"]')).toBeNull();
});
it('explicit zero initial conditions initialize only on the button and oversized checkpoint refuses before reading', async () => {
  await load(bytesFile(exportStructureNativeJson(fixture().document), 'fixture.tfstructure.json'));
  const spy = vi.spyOn(radial, 'evaluateForceShiftedRadialPotential');
  change('Initial velocity selection', 'zero'); checkbox('Confirm exploratory dynamics'); expect(spy).not.toHaveBeenCalled();
  click('Initialize Ar dynamics'); expect((await exported()).physical.ke).toBe(0);
  const before = digest(); const read = vi.fn(); const file = new File([], 'large.tf-ar-dynamics.json');
  Object.defineProperties(file, { size: { value: 1048577 }, arrayBuffer: { value: read } });
  await load(file, true); expect(read).not.toHaveBeenCalled(); expect(digest()).toBe(before);
});
