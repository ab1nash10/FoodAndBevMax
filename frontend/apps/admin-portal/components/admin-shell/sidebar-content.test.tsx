import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { renderScreen, reply } from '@/test/harness';
import { atLocation, ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { MobileTabBar } from './mobile-tab-bar';
import { SidebarContent, useNavCounts } from './sidebar-content';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/test/location'));
// The API calls the screen makes, each a typed stand-in.
type OrganizationApi = typeof ApiModule.organizationApi;
const organizationApi = vi.hoisted(() => ({
  getDashboardNavCounts: vi.fn<OrganizationApi['getDashboardNavCounts']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi,
}));

const may = (allowed: string[]) => (wanted: string | string[]) =>
  (Array.isArray(wanted) ? wanted : [wanted]).some((code) => allowed.includes(code));

beforeEach(() => {
  vi.clearAllMocks();
  at('/inventory/grns');
  atLocation(ppg);
});

describe('the side menu', () => {
  it('shows only the modules and pages the user may open, the current module open', () => {
    render(
      <SidebarContent counts={{}} hasPermission={may(['GRN_VIEW', 'STOCK_VIEW', 'ITEM_VIEW'])} />,
    );

    const menu = within(screen.getByRole('navigation', { name: 'Modules' }));
    expect(menu.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(menu.getByRole('button', { name: 'Inventory' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(menu.getByRole('button', { name: 'Item & Menu Setup' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(menu.getByRole('link', { name: 'Deliveries (GRN)' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(menu.getByRole('link', { name: 'Store Stock' })).toBeInTheDocument();
    expect(menu.queryByRole('button', { name: 'Access' })).not.toBeInTheDocument();
    expect(menu.queryByRole('link', { name: 'Transfers' })).not.toBeInTheDocument();
  });

  it('opens and folds a module', async () => {
    const user = userEvent.setup();
    render(<SidebarContent counts={{}} hasPermission={may(['GRN_VIEW', 'ITEM_VIEW'])} />);

    await user.click(screen.getByRole('button', { name: 'Item & Menu Setup' }));
    expect(screen.getByRole('link', { name: 'Items' })).toHaveAttribute('href', '/masters/items');

    await user.click(screen.getByRole('button', { name: 'Item & Menu Setup' }));
    expect(screen.queryByRole('link', { name: 'Items' })).not.toBeInTheDocument();
  });

  it('shows the work waiting on a page, and on a folded module', async () => {
    const user = userEvent.setup();
    render(<SidebarContent counts={{ grns: 4 }} hasPermission={may(['GRN_VIEW'])} />);

    expect(
      screen.getByRole('link', { name: /Deliveries \(GRN\)\s*4\s*waiting/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Inventory' }));
    expect(screen.getByRole('button', { name: /Inventory\s*4\s*waiting/ })).toBeInTheDocument();
  });

  it('closes the phone menu when a page is picked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <SidebarContent counts={{}} hasPermission={may(['GRN_VIEW'])} onNavigate={onNavigate} />,
    );

    await user.click(screen.getByRole('link', { name: 'ERP GRNs' }));

    expect(onNavigate).toHaveBeenCalled();
  });
});

describe('the work-waiting counts', () => {
  function Counts({ allowed }: { allowed: string[] }) {
    const counts = useNavCounts(may(allowed));
    return <p>{`GRNs ${counts.grns ?? '-'}`}</p>;
  }

  it('asks once for the counts at the chosen location', async () => {
    organizationApi.getDashboardNavCounts.mockReturnValue(
      reply({ grns: 2, productions: 1, transfers: 0 }),
    );
    renderScreen(<Counts allowed={['GRN_VIEW']} />);

    expect(await screen.findByText('GRNs 2')).toBeInTheDocument();
    expect(organizationApi.getDashboardNavCounts).toHaveBeenCalledWith({ hospitalId: 'h-ppg' });
  });

  it('does not ask a user who may see none of the queues', async () => {
    renderScreen(<Counts allowed={['ITEM_VIEW']} />);

    await waitFor(() => expect(screen.getByText('GRNs -')).toBeInTheDocument());
    expect(organizationApi.getDashboardNavCounts).not.toHaveBeenCalled();
  });
});

describe('the phone tab bar', () => {
  const pages = [
    { group: 'Overview', href: '/dashboard' },
    { group: 'Inventory', href: '/inventory/grns' },
    { group: 'Inventory', href: '/inventory/store-stock' },
  ];

  it('offers the day-to-day sections the user may open, each at its first page', () => {
    renderScreen(<MobileTabBar onMore={vi.fn()} pages={pages} pathname="/inventory/store-stock" />);

    const bar = within(screen.getByRole('navigation', { name: 'Sections' }));
    expect(bar.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Today',
      'Inventory',
    ]);
    expect(bar.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/inventory/grns');
    expect(bar.getByRole('link', { name: 'Inventory' })).toHaveAttribute('aria-current', 'page');
  });

  it('opens the full menu from More', async () => {
    const user = userEvent.setup();
    const onMore = vi.fn();
    renderScreen(<MobileTabBar onMore={onMore} pages={pages} pathname="/dashboard" />);

    await user.click(screen.getByRole('button', { name: 'More' }));

    expect(onMore).toHaveBeenCalled();
  });
});
