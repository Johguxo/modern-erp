// Adaptador SpreadsheetWriter (E2-H3): arma libros .xlsx con write-excel-file. Los códigos van con
// formato de texto ('@') para que Excel no les quite los ceros a la izquierda.
import writeXlsxFile, { type Sheet } from 'write-excel-file/node';

import type { SpreadsheetSheet, SpreadsheetWriter } from '../ports/spreadsheet';

function cell(value: string, header: boolean, text: boolean) {
  return {
    value,
    type: String,
    ...(header ? { fontWeight: 'bold' as const } : {}),
    ...(text && !header ? { format: '@' } : {}),
  };
}

export function createSpreadsheetWriter(): SpreadsheetWriter {
  return {
    async writeWorkbook(sheets: readonly SpreadsheetSheet[]) {
      const book: Sheet<never>[] = sheets.map((sheet) => ({
        sheet: sheet.name,
        data: sheet.rows.map((row, rowIndex) =>
          row.map((value, columnIndex) =>
            cell(value, rowIndex === 0, sheet.textColumns?.includes(columnIndex) ?? false),
          ),
        ),
        ...(sheet.widths ? { columns: sheet.widths.map((width) => ({ width })) } : {}),
        stickyRowsCount: 1,
      }));
      const buffer = await writeXlsxFile(book).toBuffer();
      return new Uint8Array(buffer);
    },
  };
}
