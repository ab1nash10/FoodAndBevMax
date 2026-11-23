import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScreenEnter } from './swiss-motion';
import { SavedViewTabs, SegmentedControl } from './ui-controls';

// jsdom lays nothing out: each item's box is given by its text; the row itself sits at 0, 0.
function boxes(byText: Record<string, { height: number; left: number; width: number }>) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const box = byText[this.textContent ?? ''] ?? { height: 0, left: 0, width: 0 };

    return {
      ...box,
      bottom: box.height,
      right: box.left + box.width,
      top: 0,
      x: box.left,
      y: 0,
    } as DOMRect;
  });
}

const indicator = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('.slide-indicator');

afterEach(() => vi.restoreAllMocks());

describe('Swiss motion: the chosen item’s indicator slides along its row', () => {
  it('underlines the chosen view tab, then moves under the next one picked', async () => {
    boxes({
      All: { height: 46, left: 12, width: 80 },
      Draft: { height: 46, left: 100, width: 60 },
    });
    function Tabs() {
      const [value, setValue] = useState<'all' | 'draft'>('all');
      return (
        <SavedViewTabs
          label="Views"
          onChange={setValue}
          value={value}
          views={[
            { label: 'All', value: 'all' },
            { label: 'Draft', value: 'draft' },
          ]}
        />
      );
    }
    const { container } = render(<Tabs />);

    // One underline for the row, hidden from screen readers (the tab says it is selected).
    expect(indicator(container)).toHaveAttribute('aria-hidden', 'true');
    expect(indicator(container)!.style.transform).toBe('translate(12px, 44px) scaleX(80)');

    await userEvent.click(screen.getByRole('tab', { name: 'Draft' }));
    expect(indicator(container)!.style.transform).toBe('translate(100px, 44px) scaleX(60)');
  });

  it('slides the segmented switch’s thumb to the option pressed', async () => {
    boxes({
      Veg: { height: 32, left: 3, width: 50 },
      'Non-veg': { height: 32, left: 55, width: 70 },
    });
    function Switch() {
      const [value, setValue] = useState<'veg' | 'non'>('veg');
      return (
        <SegmentedControl
          label="Food"
          onChange={setValue}
          options={[
            { label: 'Veg', value: 'veg' },
            { label: 'Non-veg', value: 'non' },
          ]}
          value={value}
        />
      );
    }
    const { container } = render(<Switch />);

    expect(indicator(container)!.style).toMatchObject({
      transform: 'translate(3px, 0px)',
      width: '50px',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Non-veg' }));
    expect(indicator(container)!.style).toMatchObject({
      transform: 'translate(55px, 0px)',
      width: '70px',
    });
  });
});

describe('Swiss motion: a new screen slides in from where it was opened', () => {
  function Screen({ path, rank }: Readonly<{ path: string; rank: number }>) {
    const ref = useScreenEnter<HTMLDivElement>(path, rank);
    return <div ref={ref}>{path}</div>;
  }
  // jsdom has no Web Animations: stand one in and read where each screen started from.
  const animate = vi.fn();
  const startedFrom = () =>
    animate.mock.calls.map(([frames]) => (frames as Keyframe[])[0]?.transform);

  beforeEach(() => {
    animate.mockClear();
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  });
  afterEach(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });

  it('comes from the right for a page further along the menu, the left for one before', () => {
    const { rerender } = render(<Screen path="/masters/rooms" rank={6} />);
    // The first screen just shows.
    expect(animate).not.toHaveBeenCalled();

    rerender(<Screen path="/masters/employees" rank={7} />);
    rerender(<Screen path="/masters/locations" rank={1} />);
    // An edit panel opened over the same list (its own URL) slides in by itself: the list under
    // it stays still, there and back (it moved under the panel, seen 2026-11-22).
    rerender(<Screen path="/masters/locations/abc/edit" rank={1} />);
    rerender(<Screen path="/masters/locations" rank={1} />);
    // A re-render on the same screen (a filter, a count) moves nothing.
    rerender(<Screen path="/masters/locations" rank={1} />);

    expect(startedFrom()).toEqual(['translateX(16px)', 'translateX(-16px)']);
    // Readable from its first frame, settled within the speed budget.
    const [frames, timing] = animate.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(frames[0]?.opacity).toBeGreaterThanOrEqual(0.5);
    expect(timing.duration).toBeLessThanOrEqual(160);
  });

  it('stays still for someone who asked for reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) => ({ matches: query.includes('reduce') }) as MediaQueryList,
    );
    const { rerender } = render(<Screen path="/a" rank={0} />);
    rerender(<Screen path="/b" rank={1} />);

    expect(animate).not.toHaveBeenCalled();
  });
});
