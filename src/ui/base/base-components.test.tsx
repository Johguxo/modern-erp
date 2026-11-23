// E0-H4 · Componentes base: PageHeader, EmptyState, ErrorState, DataTable, MoneyText, DateText.
import type { ColumnDef } from '@tanstack/react-table';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { messages } from '@/ui/messages/es-PE';

import { DataTable, pageHref } from './data-table';
import { DateText } from './date-text';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { MoneyText } from './money-text';
import { PageHeader } from './page-header';

const navigation = vi.hoisted(() => ({ pathname: '/bandeja', search: '' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const NBSP = ' ';

describe('PageHeader', () => {
  it('muestra el título como h1, la descripción y las acciones', () => {
    const html = renderToStaticMarkup(
      <PageHeader
        title="Bandeja de solicitudes"
        description="Tus solicitudes"
        actions={<button type="button">Nueva</button>}
      />,
    );
    expect(html).toMatch(/<h1[^>]*>Bandeja de solicitudes<\/h1>/);
    expect(html).toContain('>Tus solicitudes</p>');
    expect(html).toContain('<button type="button">Nueva</button>');
  });

  it('sin descripción ni acciones no deja contenedores vacíos', () => {
    const html = renderToStaticMarkup(<PageHeader title="Clientes" />);
    expect(html).not.toContain('<p');
    expect(html.match(/<div/g)).toHaveLength(1);
  });
});

describe('EmptyState', () => {
  it('muestra el título, la descripción y la acción', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        title="Aún no hay solicitudes"
        description="Cuando crees o recibas solicitudes, aparecerán aquí."
        action={<a href="/solicitudes/nueva">Crear la primera</a>}
      />,
    );
    expect(html).toContain('>Aún no hay solicitudes</p>');
    expect(html).toContain('>Cuando crees o recibas solicitudes, aparecerán aquí.</p>');
    expect(html).toContain('<a href="/solicitudes/nueva">Crear la primera</a>');
  });

  it('sin descripción ni acción solo muestra el título', () => {
    const html = renderToStaticMarkup(<EmptyState title="Vacío" />);
    expect(html.match(/<p/g)).toHaveLength(1);
    expect(html).not.toContain('<a');
  });
});

describe('ErrorState', () => {
  it('muestra el título y la descripción en es-PE por defecto, con role="alert"', () => {
    const html = renderToStaticMarkup(<ErrorState />);
    expect(html).toContain('role="alert"');
    expect(html).toContain(messages.states.errorTitle);
    expect(html).toContain(messages.states.errorDescription);
  });

  it('muestra el código de referencia y el botón Reintentar si hay onRetry', () => {
    const html = renderToStaticMarkup(<ErrorState reference="req_abc123" onRetry={() => {}} />);
    expect(html).toContain(`${messages.errors.reference}: <span`);
    expect(html).toContain('>req_abc123</span>');
    expect(html).toMatch(new RegExp(`<button[^>]*>${messages.states.retry}</button>`));
  });

  it('sin onRetry ni referencia no muestra el botón ni el código', () => {
    const html = renderToStaticMarkup(<ErrorState />);
    expect(html).not.toContain('<button');
    expect(html).not.toContain(messages.errors.reference);
  });

  it('nunca muestra otro texto técnico: solo título, descripción, referencia y botón', () => {
    const html = renderToStaticMarkup(<ErrorState reference="d1g3st" onRetry={() => {}} />);
    const texts = html
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    expect(texts).toEqual([
      messages.states.errorTitle,
      messages.states.errorDescription,
      `${messages.errors.reference}:`,
      'd1g3st',
      messages.states.retry,
    ]);
  });
});

describe('MoneyText (formato es-PE)', () => {
  it('muestra el monto formateado sin cortar la línea', () => {
    const html = renderToStaticMarkup(<MoneyText amount="1860.5" currency="PEN" />);
    expect(html).toContain(`>S/${NBSP}1,860.50</span>`);
    expect(html).toContain('whitespace-nowrap');
    expect(html).toContain('tabular-nums');
  });
});

describe('DateText (zona del tenant)', () => {
  it('usa <time> con dateTime ISO en UTC y el texto en la zona del tenant', () => {
    const html = renderToStaticMarkup(
      <DateText value="2026-11-23T03:30:00Z" timeZone="America/Lima" variant="date" />,
    );
    expect(html).toMatch(/^<time dateTime="2026-11-23T03:30:00.000Z"[^>]*>22 nov\.? 2026<\/time>$/);
  });

  it('por defecto incluye la hora local del tenant', () => {
    const html = renderToStaticMarkup(
      <DateText value="2026-11-23T03:30:00Z" timeZone="America/Lima" />,
    );
    expect(html).toMatch(/>22 nov\.? 2026, 10:30/);
  });
});

interface Row {
  id: string;
  code: string;
  amount: string;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'code', header: 'Código' },
  { accessorKey: 'amount', header: 'Monto' },
];

const rows: Row[] = [
  { id: '1', code: 'SOF-0001', amount: '100.00' },
  { id: '2', code: 'SOF-0002', amount: '250.50' },
];

function bodyRowCount(html: string): number {
  const body = /<tbody[\s\S]*<\/tbody>/.exec(html)?.[0] ?? '';
  return body.match(/<tr/g)?.length ?? 0;
}

describe('DataTable (TanStack)', () => {
  beforeEach(() => {
    navigation.pathname = '/bandeja';
    navigation.search = '';
  });

  it('muestra los encabezados y una fila por dato', () => {
    const html = renderToStaticMarkup(<DataTable columns={columns} data={rows} />);
    expect(html).toMatch(/<th[^>]*>Código<\/th>/);
    expect(html).toMatch(/<th[^>]*>Monto<\/th>/);
    expect(html).toContain('>SOF-0001</td>');
    expect(html).toContain('>250.50</td>');
    expect(bodyRowCount(html)).toBe(2);
  });

  it('sin datos muestra el estado vacío recibido', () => {
    const html = renderToStaticMarkup(
      <DataTable columns={columns} data={[]} emptyState={<EmptyState title="Nada aquí" />} />,
    );
    expect(html).toContain('>Nada aquí</p>');
    expect(html).toContain('colSpan="2"');
    expect(html).not.toContain(messages.dataTable.noResults);
  });

  it('sin datos ni estado vacío muestra el texto de sin resultados', () => {
    const html = renderToStaticMarkup(<DataTable columns={columns} data={[]} />);
    expect(html).toContain(messages.dataTable.noResults);
  });

  it('con una sola página no muestra la paginación', () => {
    const html = renderToStaticMarkup(<DataTable columns={columns} data={rows} />);
    expect(html).not.toContain('<nav');
  });

  it('en la primera página solo muestra Siguiente y conserva los filtros', () => {
    navigation.search = 'status=draft';
    const html = renderToStaticMarkup(
      <DataTable columns={columns} data={rows} page={1} pageCount={3} />,
    );
    expect(html).toContain(messages.dataTable.page(1, 3));
    expect(html).not.toContain(messages.dataTable.previous);
    expect(html).toContain('href="/bandeja?status=draft&amp;page=2"');
    expect(html).toContain(`>${messages.dataTable.next}</a>`);
  });

  it('en una página intermedia muestra Anterior y Siguiente', () => {
    const html = renderToStaticMarkup(
      <DataTable columns={columns} data={rows} page={2} pageCount={3} />,
    );
    expect(html).toContain('href="/bandeja?page=1"');
    expect(html).toContain(`>${messages.dataTable.previous}</a>`);
    expect(html).toContain('href="/bandeja?page=3"');
    expect(html).toContain(`>${messages.dataTable.next}</a>`);
  });

  it('en la última página solo muestra Anterior', () => {
    const html = renderToStaticMarkup(
      <DataTable columns={columns} data={rows} page={3} pageCount={3} />,
    );
    expect(html).toContain(`>${messages.dataTable.previous}</a>`);
    expect(html).not.toContain(messages.dataTable.next);
  });

  it('con getRowHref marca las filas como clicables', () => {
    const html = renderToStaticMarkup(
      <DataTable columns={columns} data={rows} getRowHref={() => '/bandeja'} />,
    );
    expect(html.match(/cursor-pointer/g)).toHaveLength(2);
  });
});

describe('pageHref', () => {
  it('conserva los demás parámetros y pone la página', () => {
    const href = pageHref('/bandeja', new URLSearchParams('status=draft&q=tubo'), 4);
    expect(href).toBe('/bandeja?status=draft&q=tubo&page=4');
  });

  it('reemplaza la página anterior en lugar de duplicarla', () => {
    const href = pageHref('/bandeja', new URLSearchParams('page=2&status=draft'), 3);
    expect(href).toBe('/bandeja?page=3&status=draft');
  });

  it('no modifica los parámetros recibidos', () => {
    const params = new URLSearchParams('status=draft');
    pageHref('/bandeja', params, 2);
    expect(params.toString()).toBe('status=draft');
  });
});
