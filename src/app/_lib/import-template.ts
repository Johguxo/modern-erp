// Plantilla .xlsx de la importación del catálogo (E2-H3): hoja 1 con los encabezados y hoja 2 con
// las instrucciones (textos de es-PE). Los códigos y demás textos van con formato de texto para no
// perder ceros a la izquierda. La descarga exige sesión (401) y catalog.manage (404: no revela
// que existe).
import { columnsOf, type ImportKind } from '@/modules/catalog';
import { hasPermission } from '@/shared/authorization';
import type { Ctx } from '@/shared/context';
import type { SpreadsheetSheet, SpreadsheetWriter } from '@/shared/ports/spreadsheet';
import { messages } from '@/ui/messages/es-PE';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const t = messages.catalog.importer.template;

export function templateSheets(kind: ImportKind): SpreadsheetSheet[] {
  const specs = columnsOf(kind);
  return [
    {
      name: t.sheets[kind],
      rows: [specs.map((spec) => (spec.required ? `${spec.header} *` : spec.header))],
      // Todo es texto menos el precio: así Excel no convierte códigos como 00123 en 123.
      textColumns: specs.flatMap((spec, index) => (spec.key === 'price' ? [] : [index])),
      widths: specs.map((spec) => (spec.key === 'name' ? 40 : 18)),
    },
    {
      name: t.sheets.instructions,
      rows: [[t.instructionsTitle], [''], ...[...t.common, ...t[kind]].map((line) => [line])],
      widths: [110],
    },
  ];
}

export interface TemplateRouteDeps {
  readonly resolveCtx: () => Promise<Ctx | null>;
  readonly writer: SpreadsheetWriter;
}

const BASE_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } as const;

export function createTemplateRoute(kind: ImportKind, deps: TemplateRouteDeps) {
  return async function GET(): Promise<Response> {
    const ctx = await deps.resolveCtx();
    if (!ctx) return new Response(null, { status: 401, headers: BASE_HEADERS });
    if (!hasPermission(ctx, 'catalog.manage')) {
      return new Response(null, { status: 404, headers: BASE_HEADERS });
    }
    const bytes = await deps.writer.writeWorkbook(templateSheets(kind));
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        ...BASE_HEADERS,
        'Content-Type': XLSX_TYPE,
        'Content-Disposition': `attachment; filename="${t.fileName[kind]}.xlsx"`,
      },
    });
  };
}
