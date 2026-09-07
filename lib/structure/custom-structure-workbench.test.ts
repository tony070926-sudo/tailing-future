// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomStructureWorkbench } from '../../app/components/custom-structure-workbench';
import {
  createDefaultStructureDraft,
  exportStructureNativeJson,
  finalizeStructureDocument,
  type StructureDocumentDraft,
} from './structure-document';
import { STRUCTURE_MAX_FILE_BYTES } from './strict-json';

vi.mock('../../app/components/custom-structure-webgl', () => ({
  CustomStructureWebgl: (props: {
    model: { sourceSemanticDigest: string; atoms: readonly { id: string }[] };
    selectedAtomId: string | null;
    onAtomSelect: (id: string) => void;
    onStatusChange?: (status: 'ready') => void;
  }) => React.createElement(
    MockStaticWebgl,
    props,
  ),
}));

function MockStaticWebgl(props: {
  model: { sourceSemanticDigest: string; atoms: readonly { id: string }[] };
  selectedAtomId: string | null;
  onAtomSelect: (id: string) => void;
  onStatusChange?: (status: 'ready') => void;
}) {
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
    expect((container.querySelectorAll('input')[1] as HTMLInputElement).value).toBe('Imported native fixture');
    expect(container.textContent).toContain('projectVerified=false');
    expect(container.textContent).not.toContain('none — user-created state');

    const importedReceipt = container.querySelector('.custom-structure-receipt dd')?.textContent;
    const x = container.querySelector('input[aria-label="x coordinate for atom 1"]') as HTMLInputElement;
    act(() => setInputValue(x, '10000.5'));
    act(() => findButton('Validate & update preview').click());
    expect(container.querySelector('.custom-structure-receipt dd')?.textContent).toBe(importedReceipt);

    act(() => setInputValue(x, '2.5'));
    act(() => findButton('Validate & update preview').click());
    expect(container.textContent).toContain('none — no bound native import receipt');

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
