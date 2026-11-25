// E2-H3 · Descarga de la plantilla: 401 sin sesión, 404 sin catalog.manage, y con permiso un .xlsx
// con las cabeceras de descarga seguras, los encabezados de la plantilla y las instrucciones.
import { makeCtx } from '@tests/support/ctx';
import { describe, expect, it } from 'vitest';

import { createSpreadsheetReader } from '@/shared/adapters/spreadsheet-reader';
import { createSpreadsheetWriter } from '@/shared/adapters/spreadsheet-writer';
import type { Ctx } from '@/shared/context';
import { messages } from '@/ui/messages/es-PE';

import { createTemplateRoute, templateSheets } from './import-template';

const MANAGER = makeCtx({ roles: ['admin'], permissions: ['catalog.manage'] });
const REQUESTER = makeCtx({ permissions: ['requests.create'] });
const writer = createSpreadsheetWriter();
const t = messages.catalog.importer.template;

const route = (kind: 'products' | 'equipment', ctx: Ctx | null) =>
  createTemplateRoute(kind, { resolveCtx: () => Promise.resolve(ctx), writer });

describe('plantillas de importación', () => {
  it('sin sesión → 401 y nada en caché', async () => {
    const response = await route('products', null)();
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type') ?? '').not.toContain('spreadsheet');
  });

  it('sin catalog.manage → 404 (no revela que existe)', async () => {
    expect((await route('products', REQUESTER)()).status).toBe(404);
    expect((await route('equipment', REQUESTER)()).status).toBe(404);
  });

  it.each([
    ['products', 'plantilla-productos.xlsx'],
    ['equipment', 'plantilla-equipos.xlsx'],
  ] as const)('%s: descarga un .xlsx con cabeceras seguras', async (kind, fileName) => {
    const response = await route(kind, MANAGER)();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers.get('Content-Disposition')).toBe(`attachment; filename="${fileName}"`);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.subarray(0, 2))).toEqual([0x50, 0x4b]);
  });

  it('la hoja 1 trae los encabezados (obligatorios con asterisco) y se puede volver a leer', async () => {
    const bytes = await writer.writeWorkbook(templateSheets('products'));

    const rows = await createSpreadsheetReader().readFirstSheet({ name: 'p.xlsx', bytes });

    expect(rows).toEqual([
      ['Código *', 'Nombre *', 'Unidad *', 'Categoría', 'Precio referencial', 'Moneda'],
    ]);
  });

  it('la hoja 2 lleva las instrucciones del tipo', () => {
    const sheets = templateSheets('equipment');

    expect(sheets.map((s) => s.name)).toEqual([t.sheets.equipment, t.sheets.instructions]);
    const lines = sheets[1]?.rows.map((row) => row[0]);
    expect(lines).toContain(t.instructionsTitle);
    expect(lines).toContain(t.equipment[0]);
    expect(lines).toContain(t.common[0]);
  });
});
