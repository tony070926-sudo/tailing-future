// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { CustomArBranchComparison } from '../../app/components/custom-ar-branch-comparison';
import { AR_INTERPRETATION, initialize, fork } from './ar-vv-adapter';
import { createDefaultStructureDraft, finalizeStructureDocument, makeFiniteNetCharge } from './structure-document';
import * as radial from '../simulation/periodic-potentials';

it('requires two explicit endpoints, follows selected stable atom, shows paired values and abstention without solver calls', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const draft = createDefaultStructureDraft(); draft.finiteSystem!.netCharge = makeFiniteNetCharge(0);
  draft.atoms = [0, 4.1].map((x, i) => ({ id: `pair-${i}`, element: { atomicNumber: 18, symbol: 'Ar' }, position: { x, y: 0, z: 0 }, formalCharge: null, isotope: null }));
  const a = initialize({ document: finalizeStructureDocument(draft), velocities: draft.atoms.map(atom => ({ atomId: atom.id, velocity: [0, 0, 0] })), dtTicks: 2, confirmation: AR_INTERPRETATION });
  const b = fork(a, []), session = { history: [a, b], head: 1, view: 1 };
  const spy = vi.spyOn(radial, 'evaluateForceShiftedRadialPotential');
  const container = document.createElement('div'), root = createRoot(container);
  const render = (selectedAtomId: string, key = 'session') => act(() => root.render(React.createElement(CustomArBranchComparison, { session, selectedAtomId, key })));
  const choose = (role: string, value: string) => act(() => { const select = container.querySelector(`[aria-label="Comparison endpoint ${role}"]`) as unknown as HTMLSelectElement; select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); });
  try {
    render('pair-0'); expect(container.querySelector('[data-testid="branch-comparison-result"]')).toBeNull();
    choose('A', '0'); expect(container.querySelector('[data-testid="branch-comparison-result"]')).toBeNull();
    choose('B', '1'); expect(container.textContent).toContain('Verified common retained parent: ' + a.stateDigest);
    expect(container.querySelector('[data-testid="branch-comparison-atom"]')?.textContent).toContain('pair-0');
    const section = container.querySelector('section')!;
    expect(section.style.minWidth).toBe('0px'); expect(section.style.maxWidth).toBe('100%'); expect(section.style.overflowWrap).toBe('anywhere');
    const regions = Array.from(container.querySelectorAll<HTMLElement>('[role="region"]'));
    expect(regions).toHaveLength(3);
    for (const [index, region] of regions.entries()) {
      expect(region.tabIndex).toBe(0); expect(region.getAttribute('aria-label')).toContain('horizontal scroll');
      expect(region.style.overflowX).toBe('auto'); expect(region.style.maxWidth).toBe('100%');
      const table = region.querySelector('table')!; expect(table.style.tableLayout).toBe('fixed');
      for (const element of [table, table.querySelector('caption')!, ...table.querySelectorAll<HTMLElement>('th[scope="row"]'), table.querySelector('thead th') as HTMLElement]) {
        expect(element.style.color).toBe('var(--custom-ink, #15352b)');
        expect(element.style.background).toBe('rgb(252, 254, 251)');
      }
      for (const element of region.querySelectorAll<HTMLElement>('[style]')) {
        expect(element.style.cssText).not.toMatch(/var\(--(?:panel|ink|mint-bright|line|line-strong)\)/);
      }
      expect(Array.from(table.querySelectorAll('col')).map(col => Number.parseInt(col.style.width))).toEqual([[100, 220, 220, 220], [185, 220, 220, 220], [185, 220, 150, 75]][index]);
      for (const header of Array.from(table.querySelectorAll<HTMLElement>('thead th')).slice(1)) expect(header.style.whiteSpace).toBe('nowrap');
      for (const label of table.querySelectorAll<HTMLElement>('tbody th')) {
        expect(label.getAttribute('scope')).toBe('row'); expect(label.style.position).toBe('sticky'); expect(label.style.left).toBe('0px');
      }
      for (const cell of table.querySelectorAll<HTMLElement>('td')) expect(cell.style.padding).toBe('10px 12px');
    }
    const energyRows = Array.from(regions[0].querySelectorAll('tbody tr'));
    for (const [index, quantity] of (['pe', 'ke', 'h'] as const).entries()) {
      expect(Array.from(energyRows[index].querySelectorAll('td')).map(cell => cell.textContent)).toEqual([a.physical[quantity], b.physical[quantity], b.physical[quantity] - a.physical[quantity]].map(String));
    }
    const atomRows = Array.from(container.querySelectorAll('[data-testid="branch-comparison-atom"] tbody tr'));
    for (const [index, quantity] of (['position', 'velocity', 'force'] as const).entries()) {
      const left = a.physical.sites[0][quantity], right = b.physical.sites[0][quantity];
      expect(Array.from(atomRows[index].querySelectorAll('td')).map(cell => cell.textContent)).toEqual([left, right, right.map((value, axis) => value - left[axis])].map(vector => vector.join(', ')));
    }
    render('pair-1'); expect(container.querySelector('[data-testid="branch-comparison-atom"]')?.textContent).toContain('pair-1');
    expect(container.textContent).toContain('energy/(amount*length)'); expect(container.textContent).toContain('not work');
    choose('B', '0'); expect(container.querySelector('[data-testid="branch-comparison-result"]')).toBeNull();
    expect(container.querySelector('[data-testid="branch-comparison-abstention"]')?.textContent).toContain('missing-fork-parent');
    render('pair-1', 'new-session'); expect((container.querySelector('[aria-label="Comparison endpoint A"]') as unknown as HTMLSelectElement).value).toBe('');
    expect(spy).not.toHaveBeenCalled(); expect(session.head).toBe(1); expect(session.view).toBe(1);
  } finally { act(() => root.unmount()); spy.mockRestore(); }
});
