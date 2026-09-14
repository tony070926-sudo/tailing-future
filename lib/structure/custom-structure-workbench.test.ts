// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomStructureWorkbench } from '../../app/components/custom-structure-workbench';
import {
  createDefaultStructureDraft,
  exportStructureNativeJson,
  finalizeStructureDocument,
  createValidationReceipt,
  makeFiniteNetCharge,
  type StructureDocumentDraft,
} from './structure-document';
import { STRUCTURE_MAX_FILE_BYTES } from './strict-json';
import { parseAndValidateExtXyz, EXTXYZ_INTERPRETATION } from './extxyz-import';
import { sha256DigestBytes } from './canonical-json';
import type { StructureRenderModel } from './structure-render-model';
import * as radialModule from '../simulation/periodic-potentials';
import { AR_INTERPRETATION, createCustomArAction, computeCustomArSinglePoint, exportCustomArResult, validateCustomArExport, type CustomArForceOverlay } from './custom-ar-singlepoint';

let observedArOverlay: CustomArForceOverlay | null | undefined;
let observedStructureModel: StructureRenderModel | null;

vi.mock('../../app/components/custom-structure-webgl', () => ({
  CustomStructureWebgl: (props: {
    model: StructureRenderModel;
    selectedAtomId: string | null;
    onAtomSelect: (id: string) => void;
    onStatusChange?: (status: 'ready') => void;
  }) => React.createElement(
    MockStaticWebgl,
    props,
  ),
}));

function MockStaticWebgl(props: {
  forceOverlay?: CustomArForceOverlay | null;
  model: StructureRenderModel;
  selectedAtomId: string | null;
  onAtomSelect: (id: string) => void;
  onStatusChange?: (status: 'ready') => void;
}) {
  React.useEffect(() => { observedArOverlay = props.forceOverlay; }, [props.forceOverlay]);
  React.useEffect(() => { observedStructureModel = props.model; }, [props.model]);
  const { onStatusChange } = props;
  React.useEffect(() => onStatusChange?.('ready'), [onStatusChange]);
  return React.createElement(
    'div',
    {
      'data-testid': 'mock-static-webgl',
      'data-digest': props.model.sourceSemanticDigest,
      'data-selected': props.selectedAtomId ?? '',
    },
    React.createElement('button', {
      type: 'button',
      onClick: () => props.model.atoms[props.model.atoms.length - 1]
        && props.onAtomSelect(props.model.atoms[props.model.atoms.length - 1].id),
    }, 'Mock select last atom'),
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  observedStructureModel = null;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('custom structure workbench component', () => {
  it('offers all 118 elements, edits atoms, and retains the last valid render for an invalid draft', () => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    const elementSelect = container.querySelector('select[aria-label="Element for atom 1"]') as unknown as HTMLSelectElement;
    expect(elementSelect.options).toHaveLength(118);
    expect(container.textContent).toContain('STRUCTURE ONLY');
    expect(container.textContent).toContain('SOLVER NOT RUN');
    expect(container.textContent).toContain('native JSON + limited plain XYZ');
    expect(container.textContent).not.toContain('native JSON only');
    expect(container.querySelectorAll('.custom-structure-abstentions article')).toHaveLength(3);

    const viewer = container.querySelector('[data-testid="mock-static-webgl"]') as HTMLElement;
    const initialDigest = viewer.dataset.digest;
    const x = container.querySelector('input[aria-label="x coordinate for atom 1"]') as HTMLInputElement;
    act(() => setInputValue(x, '10000.5'));
    expect(container.textContent).toContain('Draft changed — validate');
    act(() => findButton('Validate & update preview').click());
    expect(container.textContent).toContain('Draft invalid — last valid accepted state retained');
    expect(viewer.dataset.digest).toBe(initialDigest);

    act(() => setInputValue(x, '-2.5'));
    act(() => findButton('Validate & update preview').click());
    expect(container.textContent).toContain('Draft validated and accepted for the static viewer');
    expect(container.textContent).toContain('Static viewer status: ready');
    expect(container.textContent).toContain('-2.5 / 0 / 0 Å');
    expect(viewer.dataset.digest).not.toBe(initialDigest);

    act(() => findButton('Add atom').click());
    expect(container.textContent).toContain('Atoms (2/4096)');
    act(() => findButton('Validate & update preview').click());
    const digestBeforeSelection = viewer.dataset.digest;
    act(() => findButton('Mock select last atom').click());
    expect(container.textContent).toContain('atom-2');
    expect(viewer.dataset.digest).toBe(digestBeforeSelection);
  });

  it('keeps an imported raw receipt through refused edits and clears it only after a valid edit', async () => {
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:structure-test');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));

    const draft = createDefaultStructureDraft();
    draft.title = 'Imported native fixture';
    const bytes = exportStructureNativeJson(finalizeStructureDocument(draft));
    const file = new File([bytes.buffer as ArrayBuffer], 'fixture.tfstructure.json', {
      type: 'application/vnd.tailing-future.structure+json',
    });
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    const titleInput = [...container.querySelectorAll('label')].find((label) => label.textContent?.trim() === 'Title')?.querySelector('input');
    expect(titleInput?.value).toBe('Imported native fixture');
    expect(container.textContent).toContain('projectVerified=false');
    expect(container.textContent).not.toContain('none — user-created state');

    const importedReceipt = container.querySelector('.custom-structure-receipt dd')?.textContent;
    const x = container.querySelector('input[aria-label="x coordinate for atom 1"]') as HTMLInputElement;
    act(() => setInputValue(x, '10000.5'));
    act(() => findButton('Validate & update preview').click());
    expect(container.querySelector('.custom-structure-receipt dd')?.textContent).toBe(importedReceipt);

    act(() => setInputValue(x, '2.5'));
    act(() => findButton('Validate & update preview').click());
    expect(container.textContent).toContain('none — no bound import receipt');

    vi.useFakeTimers();
    act(() => findButton('Export native JSON').click());
    expect(createUrl).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeUrl).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_000));
    expect(revokeUrl).toHaveBeenCalledWith('blob:structure-test');
  });

  it('rejects an oversized selected file before arrayBuffer and ignores stale import completion', async () => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const oversized = new File(['x'], 'oversized.tfstructure.json');
    const oversizedRead = vi.fn(async () => new ArrayBuffer(0));
    Object.defineProperties(oversized, {
      size: { value: STRUCTURE_MAX_FILE_BYTES + 1 },
      arrayBuffer: { value: oversizedRead },
    });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [oversized] });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    expect(oversizedRead).not.toHaveBeenCalled();
    expect(container.textContent).toContain(`exceeds ${STRUCTURE_MAX_FILE_BYTES} bytes`);

    const first = nativeFile('first import', 'first.tfstructure.json');
    const second = nativeFile('second import', 'second.tfstructure.json');
    let resolveFirst: ((value: ArrayBuffer) => void) | undefined;
    const firstBuffer = new Promise<ArrayBuffer>((resolve) => { resolveFirst = resolve; });
    Object.defineProperty(first.file, 'arrayBuffer', { value: () => firstBuffer });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [first.file] });
    act(() => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [second.file] });
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(hasInputValue('second import')).toBe(true);
    await act(async () => {
      resolveFirst?.(first.buffer);
      await Promise.resolve();
    });
    expect(hasInputValue('second import')).toBe(true);
    expect(hasInputValue('first import')).toBe(false);
  });

  it('uses one shared endpoint datalist at 4096 atoms instead of per-row option explosions', async () => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    const draft = makeLargeDraft();
    const bytes = exportStructureNativeJson(finalizeStructureDocument(draft));
    const file = new File([bytes.buffer as ArrayBuffer], 'large.tfstructure.json');
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.querySelectorAll('#custom-structure-atom-ids option')).toHaveLength(4096);
    expect(container.querySelectorAll('input[list="custom-structure-atom-ids"]')).toHaveLength(128);
    expect(container.querySelectorAll('option').length).toBeLessThan(13_000);
  }, 30_000);
});

describe('plain XYZ real file import transaction', () => {
  function chooseXyz(confirm = true) {
    const select = container.querySelector('[aria-label="Import format"]');
    if (!(select instanceof HTMLSelectElement)) throw new Error('Import format selector missing');
    act(() => { select.value = 'xyz'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    if (confirm) act(() => (container.querySelector('[aria-label="Confirm XYZ interpretation"]') as HTMLInputElement).click());
  }
  function xyzFile(text = '2\n <script>hello</script> \nH 1.25 0 0\nOg -2.5 0 0', name = 'input.xyz') {
    // No equals sign: accepted prose remains text, never HTML.
    const buffer = new TextEncoder().encode(text).buffer;
    const file = new File([buffer], name);
    Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: async () => buffer });
    return { file, buffer };
  }
  async function importFile(file: File) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  const digest = () => container.querySelector('[data-testid="mock-static-webgl"]')?.getAttribute('data-digest');

  it('requires confirmation then imports XYZ into viewer/readouts and rolls back refused input', async () => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    chooseXyz(false);
    const fixture = xyzFile('2\n <script>hello</script> \nH 1.25 0 0\nOg -2.5 0 0');
    const initial = digest();
    await importFile(fixture.file);
    expect(digest()).toBe(initial);
    expect(container.textContent).toContain('Confirm the XYZ interpretation');
    act(() => (container.querySelector('[aria-label="Confirm XYZ interpretation"]') as HTMLInputElement).click());
    await importFile(fixture.file);
    expect(digest()).not.toBe(initial);
    expect(container.textContent).toContain(' <script>hello</script> ');
    expect(container.querySelector('script')).toBeNull();
    expect(hasInputValue('1.25')).toBe(true);
    expect(container.querySelector('.custom-structure-inspector')?.textContent).toContain('1.25 / 0 / 0 Å');
    act(() => findButton('Mock select last atom').click());
    expect(container.querySelector('[data-testid="mock-static-webgl"]')?.getAttribute('data-selected')).toBe('xyz-row-0002');
    expect(hasInputValue('-2.5')).toBe(true);
    expect(container.querySelector('.custom-structure-inspector')?.textContent).toContain('Z=118 · Og');
    expect(container.querySelector('.custom-structure-inspector')?.textContent).toContain('-2.5 / 0 / 0 Å');
    expect(container.textContent).toContain('not the XYZ comment or transport receipt');
    const accepted = digest(), receipt = container.querySelector('.custom-structure-receipt')?.textContent;
    await importFile(xyzFile('1\nProperties=bad\nH 0 0 0').file);
    expect(digest()).toBe(accepted);
    expect(container.querySelector('.custom-structure-receipt')?.textContent).toBe(receipt);
    await importFile(xyzFile('1\n\nH 0 0 0', 'wrong.json').file);
    expect(digest()).toBe(accepted);
  });

  it.each(['format', 'confirmation', 'draft', 'apply', 'newer', 'unmount'].flatMap(action =>
    ['resolve', 'reject'].map(outcome => ({ action, outcome }))))('invalidates pending XYZ $outcome after $action', async ({ action, outcome }) => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    chooseXyz();
    await importFile(xyzFile().file);
    const fixture = xyzFile('1\nlate\nOg 999 0 0');
    let resolve!: (buffer: ArrayBuffer) => void;
    let reject!: (reason: Error) => void;
    Object.defineProperty(fixture.file, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>((done, fail) => { resolve = done; reject = fail; }) });
    await importFile(fixture.file);
    if (action === 'format') act(() => {
      const select = container.querySelector('[aria-label="Import format"]');
      if (!(select instanceof HTMLSelectElement)) throw new Error('Import format selector missing');
      select.value = 'native'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (action === 'confirmation') act(() => (container.querySelector('[aria-label="Confirm XYZ interpretation"]') as HTMLInputElement).click());
    if (action === 'draft') act(() => setInputValue(container.querySelector('input[aria-label="x coordinate for atom 1"]') as HTMLInputElement, '2'));
    if (action === 'apply') {
      act(() => setInputValue(container.querySelector('input[aria-label="x coordinate for atom 1"]') as HTMLInputElement, '2'));
      act(() => findButton('Validate').click());
    }
    if (action === 'newer') await importFile(xyzFile('1\nnew\nHe 3 0 0').file);
    if (action === 'unmount') act(() => root.render(null));
    const current = digest(), currentText = container.textContent;
    const currentReceipt = container.querySelector('.custom-structure-receipt')?.textContent;
    await act(async () => {
      if (outcome === 'resolve') resolve(fixture.buffer);
      else reject(new Error('stale XYZ read failed'));
    });
    expect(digest()).toBe(current);
    expect(container.textContent).toBe(currentText);
    expect(container.querySelector('.custom-structure-receipt')?.textContent).toBe(currentReceipt);
    expect(hasInputValue('999')).toBe(false);
  });

  it('retains the accepted XYZ receipt when a current file read rejects', async () => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    chooseXyz();
    await importFile(xyzFile().file);
    const accepted = digest(), receipt = container.querySelector('.custom-structure-receipt')?.textContent;
    const failed = xyzFile();
    Object.defineProperty(failed.file, 'arrayBuffer', { value: async () => { throw new Error('current XYZ read failed'); } });
    await importFile(failed.file);
    expect(digest()).toBe(accepted);
    expect(container.querySelector('.custom-structure-receipt')?.textContent).toBe(receipt);
    expect(container.textContent).toContain('Transport refused — accepted structure unchanged: current XYZ read failed');
  });
});

describe('strict extXYZ geometry file transaction', () => {
  const fixtureText = '2\r\nProperties=id:S:1:species:S:1:pos:R:3 pbc="T T T" Lattice="4 1 0 0 5 2 1 0 6"\r\nsite-a H 1.25 0 0\r\nsite-b Og -2.5 0 0\r\n';
  const digest = () => container.querySelector('[data-testid="mock-static-webgl"]')?.getAttribute('data-digest');
  const receiptText = () => container.querySelector('.custom-structure-receipt')?.textContent;
  function formatSelect(): HTMLSelectElement {
    const select = container.querySelector('[aria-label="Import format"]');
    if (!(select instanceof HTMLSelectElement)) throw new Error('Import format selector missing');
    return select;
  }
  function chooseExtxyz(confirm = true) {
    const select = formatSelect();
    act(() => { select.value = 'extxyz'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    if (confirm) act(() => (container.querySelector('[aria-label="Confirm extXYZ geometry interpretation"]') as HTMLInputElement).click());
  }
  function fixture(text = fixtureText, name = 'input.extxyz') {
    const bytes = new Uint8Array(new TextEncoder().encode(text)), buffer = bytes.buffer;
    const file = new File([buffer], name);
    Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: async () => buffer });
    return { file, buffer, bytes };
  }
  async function importFile(file: File) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  }
  async function readBlob(blob: Blob) {
    return new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    }));
  }

  it('requires explicit interpretation and binds nonorthogonal geometry, IDs and null outputs to the viewer', async () => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    chooseExtxyz(false);
    const input = fixture(), initial = digest();
    const read = vi.spyOn(input.file, 'arrayBuffer');
    await importFile(input.file);
    expect(read).not.toHaveBeenCalled();
    expect(digest()).toBe(initial);
    expect(container.textContent).toContain('Confirm the extXYZ geometry interpretation');
    act(() => (container.querySelector('[aria-label="Confirm extXYZ geometry interpretation"]') as HTMLInputElement).click());
    await importFile(input.file);
    const parsed = parseAndValidateExtXyz(input.bytes, input.file.name, EXTXYZ_INTERPRETATION);
    expect(digest()).toBe(parsed.document.semanticDigest);
    expect(receiptText()).toContain(parsed.transportReceipt.receiptDigest);
    expect(receiptText()).toContain('tf.extxyz-geometry/0.1');
    expect(observedStructureModel?.cellEdges).toHaveLength(12);
    expect(observedStructureModel?.cellEdges.flatMap(edge => [edge.exactRepresentativeStartAngstrom, edge.exactRepresentativeEndAngstrom])).toContainEqual([5, 6, 8]);
    expect(observedStructureModel?.atoms.map(atom => [atom.id, atom.exactPositionAngstrom])).toEqual([
      ['site-a', [1.25, 0, 0]], ['site-b', [-2.5, 0, 0]],
    ]);
    expect(Object.values(observedStructureModel!.unavailableOutputs).every(value => value === null)).toBe(true);
    expect(observedArOverlay).toBeNull();
    expect(container.textContent).toContain('SOLVER NOT RUN');
    expect(container.querySelectorAll('.custom-structure-abstentions article')).toHaveLength(3);
    act(() => findButton('Mock select last atom').click());
    expect(container.querySelector('.custom-structure-inspector')?.textContent).toContain('Z=118 · Og');
    expect(container.querySelector('.custom-structure-inspector')?.textContent).toContain('-2.5 / 0 / 0 Å');
    expect(digest()).toBe(parsed.document.semanticDigest);
  });

  it('downloads exact original CRLF bytes and retains them through rejected drafts, then clears after accepted edits', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:extxyz-test');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    chooseExtxyz();
    const input = fixture();
    await importFile(input.file);
    expect(container.textContent).toContain('not the raw header, original formatting or transport receipt');
    const originalDigest = digest(), originalReceipt = receiptText();
    act(() => setInputValue(container.querySelector('input[aria-label="x coordinate for atom 1"]') as HTMLInputElement, '10000.5'));
    act(() => findButton('Validate').click());
    expect(digest()).toBe(originalDigest);
    expect(receiptText()).toBe(originalReceipt);
    vi.useFakeTimers();
    act(() => findButton('Download accepted original extXYZ').click());
    expect(createUrl).toHaveBeenCalledOnce();
    expect(revokeUrl).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_000));
    expect(revokeUrl).toHaveBeenCalledWith('blob:extxyz-test');
    vi.useRealTimers();
    const exported = await readBlob(createUrl.mock.calls[0][0] as Blob);
    expect(Array.from(exported)).toEqual(Array.from(input.bytes));
    expect(sha256DigestBytes(exported)).toBe(sha256DigestBytes(input.bytes));
    act(() => setInputValue(container.querySelector('input[aria-label="x coordinate for atom 1"]') as HTMLInputElement, '2.5'));
    act(() => findButton('Validate').click());
    expect(receiptText()).toContain('none — no bound import receipt');
    expect(container.textContent).not.toContain('Download accepted original extXYZ');
  });

  it.each([
    fixtureText.replace(' pbc=', ' energy=-999 pbc='),
    fixtureText.replace('pos:R:3', 'pos:R:3:forces:R:3'),
    fixtureText.replace('pbc="T T T"', 'pbc="T T F"'),
    fixtureText.replace(' pbc=', ' units=bohr pbc='),
    fixtureText.replace(' pbc=', ' source=2D-layout pbc='),
    fixtureText + fixtureText,
  ])('atomically refuses unsupported fields/boundaries without replacing accepted geometry or receipt', async text => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    chooseExtxyz();
    await importFile(fixture().file);
    const accepted = digest(), receipt = receiptText();
    await importFile(fixture(text).file);
    expect(digest()).toBe(accepted);
    expect(receiptText()).toBe(receipt);
    expect(container.textContent).toContain('Transport refused — accepted structure unchanged');
    expect(container.textContent).toContain('Download accepted original extXYZ');
    expect(observedArOverlay).toBeNull();
  });

  it.each(['format', 'confirmation', 'draft', 'apply', 'newer', 'unmount'].flatMap(action =>
    ['resolve', 'reject'].map(outcome => ({ action, outcome }))))('invalidates pending extXYZ $outcome after $action', async ({ action, outcome }) => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    chooseExtxyz();
    await importFile(fixture().file);
    const late = fixture(fixtureText.replace('1.25', '999'));
    let resolve!: (bytes: ArrayBuffer) => void, reject!: (reason: Error) => void;
    Object.defineProperty(late.file, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>((done, fail) => { resolve = done; reject = fail; }) });
    await importFile(late.file);
    if (action === 'format') act(() => {
      const select = formatSelect();
      select.value = 'native'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (action === 'confirmation') act(() => (container.querySelector('[aria-label="Confirm extXYZ geometry interpretation"]') as HTMLInputElement).click());
    if (action === 'draft' || action === 'apply') act(() => setInputValue(container.querySelector('input[aria-label="x coordinate for atom 1"]') as HTMLInputElement, '2'));
    if (action === 'apply') act(() => findButton('Validate').click());
    if (action === 'newer') await importFile(fixture(fixtureText.replace('1.25', '3')).file);
    if (action === 'unmount') act(() => root.render(null));
    const accepted = digest(), receipt = receiptText(), currentText = container.textContent;
    await act(async () => {
      if (outcome === 'resolve') resolve(late.buffer);
      else reject(new Error('stale extXYZ read failed'));
    });
    expect(digest()).toBe(accepted);
    expect(receiptText()).toBe(receipt);
    expect(container.textContent).toBe(currentText);
    expect(hasInputValue('999')).toBe(false);
  });

  it('accepts geometry in .xyz, rejects wrong suffix and clears original bytes on a native replacement', async () => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    chooseExtxyz();
    await importFile(fixture(fixtureText, 'input.xyz').file);
    expect(container.textContent).toContain('Download accepted original extXYZ');
    const accepted = digest();
    const wrong = fixture(fixtureText, 'wrong.json');
    const read = vi.spyOn(wrong.file, 'arrayBuffer');
    await importFile(wrong.file);
    expect(read).not.toHaveBeenCalled();
    expect(digest()).toBe(accepted);
    act(() => {
      const select = formatSelect();
      select.value = 'native'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await importFile(nativeFile('replacement', 'replacement.tfstructure.json').file);
    expect(container.textContent).not.toContain('Download accepted original extXYZ');
    expect(digest()).not.toBe(accepted);
  });
});

describe('explicit finite Ar accepted-document UI action', () => {
  function packageBytes(n: number) {
    const draft = draftAr(n); draft.finiteSystem!.netCharge = makeFiniteNetCharge(0);
    const document = finalizeStructureDocument(draft), receipt = createValidationReceipt(document);
    const action = createCustomArAction(document, receipt, AR_INTERPRETATION);
    const result = computeCustomArSinglePoint(document, receipt, action);
    if (result.decision !== 'computed') throw new Error(result.reason);
    return { bytes: exportCustomArResult(document, receipt, action, result), document, result };
  }
  async function loadPackage(bytes: Uint8Array, name = 'replay.tf-ar-singlepoint.json') {
    const select = container.querySelector('[aria-label="Import format"]');
    if (!(select instanceof HTMLSelectElement)) throw new Error('format selector missing');
    act(() => { select.value = 'ar-result'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    const file = new File([bytes.buffer as ArrayBuffer], name);
    const read = vi.fn(async () => bytes.buffer);
    Object.defineProperty(file, 'arrayBuffer', { value: read });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    return read;
  }
  it.each(['replay.tf-ar-singlepoint (2).json', 'replay.tf-ar-singlepoint (10).json'])('stages a numbered Ar download without invoking the solver: %s', async (name) => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    const fixture = packageBytes(12);
    const prior = container.querySelector('[data-testid="mock-static-webgl"]')?.getAttribute('data-digest');
    const radialCalls = vi.spyOn(radialModule, 'evaluateForceShiftedRadialPotential');
    const read = await loadPackage(fixture.bytes, name);
    expect(read).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="ar-staged-package"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ar-energy"]')).toBeNull();
    expect(observedArOverlay).toBeNull();
    expect(container.querySelector('[data-testid="mock-static-webgl"]')?.getAttribute('data-digest')).toBe(prior);
    expect(findButton('Recompute & accept Ar result package').disabled).toBe(true);
    expect(radialCalls).not.toHaveBeenCalled();
    act(() => (container.querySelector('[aria-label="Confirm exploratory finite Ar model"]') as HTMLInputElement).click());
    expect(radialCalls).not.toHaveBeenCalled();
    act(() => findButton('Recompute & accept Ar result package').click());
    expect(radialCalls.mock.calls.length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="ar-result-digest"]')?.textContent).toBe(fixture.result.resultDigest);
    expect(observedArOverlay?.semanticDigest).toBe(fixture.document.semanticDigest);
    expect(observedArOverlay?.vectors).toHaveLength(12);
  });
  it.each([
    'replay.json', 'replay (2).json', 'replay.tf-ar-singlepoint (0).json',
    'replay.tf-ar-singlepoint (01).json', 'replay.tf-ar-singlepoint (-2).json',
    'replay.tf-ar-singlepoint (2.0).json', 'replay.tf-ar-singlepoint (2).json.txt',
    'replay.tf-ar-singlepoint (2).json\n', 'replay.tf-ar-singlepoint (2) (3).json',
  ])('refuses a non-admitted Ar filename before reading its bytes: %s', async (name) => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    const fixture = packageBytes(12);
    const prior = container.querySelector('[data-testid="mock-static-webgl"]')?.getAttribute('data-digest');
    const radialCalls = vi.spyOn(radialModule, 'evaluateForceShiftedRadialPotential');
    const read = await loadPackage(fixture.bytes, name);
    expect(read).not.toHaveBeenCalled();
    expect(radialCalls).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Only .tf-ar-singlepoint.json files are accepted.');
    expect(container.querySelector('[data-testid="ar-staged-package"]')).toBeNull();
    expect(container.querySelector('[data-testid="ar-energy"]')).toBeNull();
    expect(container.querySelector('[data-testid="mock-static-webgl"]')?.getAttribute('data-digest')).toBe(prior);
  });
  for (const n of [12, 64]) it(`stages and explicitly replays N=${n} with stable first/last IDs, then invalidates on edit`, async () => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    const fixture = packageBytes(n), prior = container.querySelector('[data-testid="mock-static-webgl"]')?.getAttribute('data-digest');
    const radialCalls = vi.spyOn(radialModule, 'evaluateForceShiftedRadialPotential');
    await loadPackage(fixture.bytes);
    expect(radialCalls).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="ar-energy"]')).toBeNull();
    expect(observedArOverlay).toBeNull();
    expect(container.querySelector('[data-testid="mock-static-webgl"]')?.getAttribute('data-digest')).toBe(prior);
    expect(findButton('Recompute & accept Ar result package').disabled).toBe(true);
    act(() => (container.querySelector('[aria-label="Confirm exploratory finite Ar model"]') as HTMLInputElement).click());
    expect(radialCalls).not.toHaveBeenCalled();
    act(() => findButton('Recompute & accept Ar result package').click());
    expect(radialCalls.mock.calls.length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="ar-result-digest"]')?.textContent).toBe(fixture.result.resultDigest);
    expect(observedArOverlay?.semanticDigest).toBe(fixture.document.semanticDigest);
    expect(observedArOverlay?.resultDigest).toBe(fixture.result.resultDigest);
    expect(observedArOverlay?.vectors).toHaveLength(n);
    const maximumForce = Math.max(...fixture.result.atomicForces.values.map((force) => Math.hypot(force.x, force.y, force.z)));
    const scale = maximumForce === 0 ? null : 2 / maximumForce;
    expect(observedArOverlay?.scale).toBe(scale);
    for (const [index, force] of fixture.result.atomicForces.values.entries()) {
      const atom = fixture.document.atoms.find((entry) => entry.id === force.atomId)!;
      const start = [atom.position.x, atom.position.y, atom.position.z];
      const end = start.map((value, axis) => value + (scale ?? 0) * [force.x, force.y, force.z][axis]);
      expect(observedArOverlay?.vectors[index]).toEqual({ atomId: force.atomId, start, end });
    }
    for (const id of ['ar-000', `ar-${String(n - 1).padStart(3, '0')}`]) {
      act(() => (container.querySelector(`[aria-label="Inspect atom ${id}"]`) as HTMLButtonElement).click());
      expect(container.querySelector('[data-testid="mock-static-webgl"]')?.getAttribute('data-selected')).toBe(id);
      const force = fixture.result.atomicForces.values.find((entry) => entry.atomId === id)!;
      expect(container.querySelector('[data-testid="selected-ar-force"]')?.textContent).toBe(`${force.x} / ${force.y} / ${force.z} kJ mol^-1 Å^-1`);
    }
    act(() => setInputValue(container.querySelector('[aria-label="x coordinate for atom 1"]') as HTMLInputElement, '0.05'));
    expect(container.querySelector('[data-testid="ar-energy"]')).toBeNull();
    if (n === 12) { act(() => findButton('Validate & update preview').click()); confirmAndCompute(); expect(container.querySelector('[data-testid="ar-result-digest"]')?.textContent).not.toBe(fixture.result.resultDigest); }
  });
  it.each(['replay.tf-ar-singlepoint.json', 'replay.tf-ar-singlepoint (2).json'])('refuses tampered staged results without changing accepted structure: %s', async (name) => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    const prior = container.querySelector('[data-testid="mock-static-webgl"]')?.getAttribute('data-digest');
    const packet = JSON.parse(new TextDecoder().decode(packageBytes(12).bytes)); packet.result.energy.value += 1;
    await loadPackage(new TextEncoder().encode(JSON.stringify(packet)), name);
    act(() => (container.querySelector('[aria-label="Confirm exploratory finite Ar model"]') as HTMLInputElement).click());
    act(() => findButton('Recompute & accept Ar result package').click());
    expect(container.querySelector('[data-testid="ar-energy"]')).toBeNull();
    expect(container.querySelector('[data-testid="mock-static-webgl"]')?.getAttribute('data-digest')).toBe(prior);
    expect(container.textContent).toContain('ABSTAIN');
  });
  for (const action of ['draft', 'format', 'hide', 'cancel-file']) for (const ending of ['resolve', 'reject']) it(`ignores stale Ar package ${ending} after ${action}`, async () => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    const select = container.querySelector('[aria-label="Import format"]');
    if (!(select instanceof HTMLSelectElement)) throw new Error('format missing');
    act(() => { select.value = 'ar-result'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    const fixture = packageBytes(12);
    let resolve!: (bytes: ArrayBuffer) => void, reject!: (error: Error) => void;
    const file = new File([], 'pending.tf-ar-singlepoint.json');
    Object.defineProperty(file, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>((yes, no) => { resolve = yes; reject = no; }) });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    if (action === 'draft') act(() => setInputValue(container.querySelector('[aria-label="x coordinate for atom 1"]') as HTMLInputElement, '0.2'));
    if (action === 'format') act(() => { select.value = 'native'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    if (action === 'hide') act(() => root.render(React.createElement(CustomStructureWorkbench, { active: false, onBack: vi.fn() })));
    if (action === 'cancel-file') { Object.defineProperty(input, 'files', { configurable: true, value: [] }); await act(async () => input.dispatchEvent(new Event('change', { bubbles: true }))); }
    await act(async () => { if (ending === 'resolve') resolve(fixture.bytes.buffer as ArrayBuffer); else reject(new Error('stale-result-read')); });
    expect(container.querySelector('[data-testid="ar-staged-package"]')).toBeNull();
    expect(container.querySelector('[data-testid="ar-energy"]')).toBeNull();
    expect(container.textContent).not.toContain('stale-result-read');
  });
  it('discards a staged package when current confirmation is revoked', async () => {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    await loadPackage(packageBytes(12).bytes);
    const checkbox = container.querySelector('[aria-label="Confirm exploratory finite Ar model"]') as HTMLInputElement;
    act(() => checkbox.click()); act(() => checkbox.click());
    expect(container.querySelector('[data-testid="ar-staged-package"]')).toBeNull();
    expect(container.querySelector('[data-testid="ar-energy"]')).toBeNull();
  });
  function draftAr(n: number) {
    const draft = createDefaultStructureDraft();
    draft.atoms = Array.from({ length: n }, (_, i) => {
      const x = i % 4, y = Math.floor(i / 4) % 4, z = Math.floor(i / 16);
      return { id: `ar-${String(i).padStart(3, '0')}`, element: { atomicNumber: 18, symbol: 'Ar' },
        position: { x: 3.8 * x + 0.01 * y, y: 3.8 * y + 0.02 * z, z: 3.8 * z + 0.03 * x }, isotope: null, formalCharge: null };
    });
    return draft;
  }
  async function importAr(draft: StructureDocumentDraft) {
    const bytes = exportStructureNativeJson(finalizeStructureDocument(draft));
    const file = new File([bytes.buffer as ArrayBuffer], 'argon.tfstructure.json');
    Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  }
  function confirmAndCompute() {
    act(() => (container.querySelector('[aria-label="Confirm exploratory finite Ar model"]') as HTMLInputElement).click());
    act(() => findButton('Compute Ar single point').click());
  }
  async function ready(n = 12) {
    act(() => root.render(React.createElement(CustomStructureWorkbench, { active: true, onBack: vi.fn() })));
    const draft = draftAr(n); await importAr(draft);
    expect(container.querySelector('[data-testid="ar-energy"]')).toBeNull();
    const charge = [...container.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Net charge Q'))!.querySelector('input')!;
    act(() => setInputValue(charge, '0'));
    act(() => findButton('Validate & update preview').click());
    draft.finiteSystem!.netCharge = makeFiniteNetCharge(0);
    confirmAndCompute(); return draft;
  }
  for (const n of [12, 64]) it(`imports, explicitly declares charge and computes all accepted Ar forces N=${n}`, async () => {
    const draft = await ready(n), document = finalizeStructureDocument(draft), receipt = createValidationReceipt(document);
    const result = computeCustomArSinglePoint(document, receipt, createCustomArAction(document, receipt, AR_INTERPRETATION));
    if (result.decision !== 'computed') throw new Error(result.reason);
    expect(container.querySelector('[data-testid="ar-energy"]')?.textContent).toContain(String(result.energy.value));
    expect(container.textContent).toContain('EXPLORATORY SINGLE POINT');
    expect(container.textContent).toContain('zero automatic calls');
    expect(container.querySelectorAll('.custom-structure-abstentions article')).toHaveLength(3);
    for (const i of [0, n - 1]) {
      act(() => (container.querySelector(`[aria-label="Inspect atom ${draft.atoms[i].id}"]`) as HTMLButtonElement).click());
      const force = result.atomicForces.values[i];
      expect(container.querySelector('[data-testid="selected-ar-force"]')?.textContent).toBe(`${force.x} / ${force.y} / ${force.z} kJ mol^-1 Å^-1`);
    }
    expect(observedArOverlay?.semanticDigest).toBe(document.semanticDigest);
    expect(observedArOverlay?.vectors).toHaveLength(n);
    const max = Math.max(...result.atomicForces.values.map((f) => Math.hypot(f.x, f.y, f.z)));
    expect(observedArOverlay?.scale).toBe(2 / max);
    observedArOverlay!.vectors.forEach((v, i) => {
      const atom = draft.atoms[i], force = result.atomicForces.values[i];
      expect(v.start).toEqual([atom.position.x, atom.position.y, atom.position.z]);
      v.end.forEach((end, k) => expect(end - v.start[k]).toBeCloseTo([force.x, force.y, force.z][k] * observedArOverlay!.scale!, 12));
    });
    let blob: Blob | undefined;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((value: Blob) => { blob = value; return 'blob:ar-test'; }) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    act(() => findButton('Export Ar single-point result').click());
    expect(click).toHaveBeenCalledOnce();
    const text = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob!); });
    expect(validateCustomArExport(JSON.parse(text))).toEqual(result);
  });

  for (const mutation of ['draft', 'invalid-apply', 'valid-apply', 'format', 'confirmation', 'import-success', 'import-failure', 'hidden']) it(`revokes result, confirmation and overlay on ${mutation}`, async () => {
    await ready();
    if (mutation === 'draft' || mutation.endsWith('apply')) {
      act(() => setInputValue(container.querySelector('[aria-label="x coordinate for atom 1"]') as HTMLInputElement, mutation === 'invalid-apply' ? '10001' : '0.01'));
      if (mutation.endsWith('apply')) act(() => findButton('Validate & update preview').click());
    } else if (mutation === 'format') {
      const select = container.querySelector('[aria-label="Import format"]');
      if (!(select instanceof HTMLSelectElement)) throw new Error('Missing selector');
      act(() => { select.value = 'xyz'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    } else if (mutation === 'confirmation') act(() => (container.querySelector('[aria-label="Confirm exploratory finite Ar model"]') as HTMLInputElement).click());
    else if (mutation === 'hidden') act(() => root.render(React.createElement(CustomStructureWorkbench, { active: false, onBack: vi.fn() })));
    else if (mutation === 'import-success') await importAr(draftAr(12));
    else {
      const file = new File(['bad'], 'bad.xyz');
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    }
    expect(container.querySelector('[data-testid="ar-energy"]')).toBeNull();
    expect(observedArOverlay).toBeNull();
    expect(findButton('Compute Ar single point').disabled).toBe(true);
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Export Ar single-point result')).toBe(false);
  });
  it('recomputes changed coordinates under new identities and displays a zero-force finite system without arrows', async () => {
    await ready();
    const initial = ['ar-input-digest', 'ar-action-digest', 'ar-result-digest', 'ar-energy', 'selected-ar-force'].map((id) => container.querySelector(`[data-testid="${id}"]`)?.textContent);
    act(() => setInputValue(container.querySelector('[aria-label="x coordinate for atom 1"]') as HTMLInputElement, '0.01'));
    expect(observedArOverlay).toBeNull();
    act(() => findButton('Validate & update preview').click()); confirmAndCompute();
    ['ar-input-digest', 'ar-action-digest', 'ar-result-digest', 'ar-energy', 'selected-ar-force'].forEach((id, i) => expect(container.querySelector(`[data-testid="${id}"]`)?.textContent).not.toBe(initial[i]));
    const distant = draftAr(12); distant.finiteSystem!.netCharge = makeFiniteNetCharge(0);
    distant.atoms.forEach((atom, i) => { atom.position = { x: i * 5, y: 0, z: 0 }; });
    await importAr(distant); confirmAndCompute();
    expect(container.querySelector('[data-testid="ar-energy"]')?.textContent).toContain('Energy: 0 kJ/mol');
    expect(container.querySelector('[data-testid="ar-force-scale"]')?.textContent).toBe('All forces zero: no arrows.');
    expect(observedArOverlay?.scale).toBeNull();
    expect(observedArOverlay?.vectors.every((v) => v.start.every((x, i) => x === v.end[i]))).toBe(true);
  });
  for (const outcome of ['resolve', 'reject']) it(`disables action during pending read and after ${outcome}`, async () => {
    await ready(); let resolve!: (value: ArrayBuffer) => void; let reject!: (error: Error) => void;
    const file = new File(['pending'], 'pending.tfstructure.json');
    Object.defineProperty(file, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>((yes, no) => { resolve = yes; reject = no; }) });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(findButton('Compute Ar single point').disabled).toBe(true);
    expect((container.querySelector('[aria-label="Confirm exploratory finite Ar model"]') as HTMLInputElement).disabled).toBe(true);
    await act(async () => { if (outcome === 'reject') reject(new Error('read failed')); else resolve(exportStructureNativeJson(finalizeStructureDocument(draftAr(12))).buffer as ArrayBuffer); });
    expect(container.querySelector('[data-testid="ar-energy"]')).toBeNull();
    expect(observedArOverlay).toBeNull();
    expect(findButton('Compute Ar single point').disabled).toBe(true);
  });
});

function findButton(label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function hasInputValue(value: string): boolean {
  return [...container.querySelectorAll('input')].some((input) => input.value === value);
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing HTMLInputElement value setter.');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function nativeFile(title: string, name: string) {
  const draft = createDefaultStructureDraft();
  draft.title = title;
  const bytes = exportStructureNativeJson(finalizeStructureDocument(draft));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const file = new File([buffer], name);
  Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: async () => buffer });
  return { file, buffer };
}

function makeLargeDraft(): StructureDocumentDraft {
  const draft = createDefaultStructureDraft();
  draft.atoms = Array.from({ length: 4096 }, (_, index) => ({
    id: `atom-${index + 1}`,
    element: { atomicNumber: 1, symbol: 'H' },
    position: { x: index % 100, y: Math.floor(index / 100), z: 0 },
    isotope: null,
    formalCharge: null,
  }));
  draft.connections = Array.from({ length: 64 }, (_, index) => ({
    id: `connection-${index + 1}`,
    atomAId: `atom-${index + 1}`,
    atomBId: `atom-${index + 2}`,
    order: 'unknown' as const,
    provenance: 'user-declared' as const,
    role: 'display-only' as const,
    energeticInteraction: false as const,
    imageShiftForB: [0, 0, 0] as [number, number, number],
  }));
  return draft;
}
