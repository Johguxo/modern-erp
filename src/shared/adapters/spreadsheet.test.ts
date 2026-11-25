// E2-H3 · Adaptadores de hojas de cálculo: escritura, lectura de .xlsx y .csv, filas vacías
// intermedias, límites y archivos que no son lo que dicen ser. Sin base de datos.
import { deflateRawSync } from 'node:zlib';

import { zipSync, strToU8 } from 'fflate';
import writeXlsxFile from 'write-excel-file/node';
import { describe, expect, it } from 'vitest';

import { isDomainError } from '../errors';
import { SPREADSHEET_LIMITS } from '../ports/spreadsheet';

import { createSpreadsheetReader } from './spreadsheet-reader';
import { createSpreadsheetWriter } from './spreadsheet-writer';

const reader = createSpreadsheetReader();
const writer = createSpreadsheetWriter();

const csv = (text: string, name = 'datos.csv') => ({ name, bytes: strToU8(text) });

async function rejectionReason(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    if (isDomainError(error)) return error.reason;
    throw error;
  }
  throw new Error('Se esperaba un rechazo y el archivo se leyó.');
}

/** .xlsx escrito a mano: permite valores en caché de fórmulas y filas vacías intermedias. */
function handMadeXlsx(sheetXml: string, extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetXml}</sheetData></worksheet>`,
    ),
    ...extra,
  });
}

const inline = (ref: string, text: string) =>
  `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;

describe('SpreadsheetWriter', () => {
  it('ida y vuelta: los textos (con ceros a la izquierda y tildes) se leen igual', async () => {
    const bytes = await writer.writeWorkbook([
      {
        name: 'Productos',
        rows: [
          ['codigo', 'nombre'],
          ['00123', 'Tubería de acero'],
          ['A-2', 'Ñandú'],
        ],
        textColumns: [0],
        widths: [14, 30],
      },
      { name: 'Instrucciones', rows: [['Paso'], ['Llene la hoja']] },
    ]);

    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const rows = await reader.readFirstSheet({ name: 'plantilla.xlsx', bytes });
    expect(rows).toEqual([
      ['codigo', 'nombre'],
      ['00123', 'Tubería de acero'],
      ['A-2', 'Ñandú'],
    ]);
  });
});

describe('SpreadsheetReader · .xlsx', () => {
  it('lee número como texto exacto, fecha en ISO, texto y celda vacía', async () => {
    const buffer = await writeXlsxFile([
      {
        sheet: 'Hoja1',
        data: [
          [
            { value: 'a', type: String },
            { value: 'b', type: String },
            { value: 'c', type: String },
          ],
          [
            { value: 12.3, type: Number },
            { value: new Date(Date.UTC(2026, 10, 24)), type: Date, format: 'yyyy-mm-dd' },
            null,
          ],
        ],
      },
    ]).toBuffer();

    const rows = await reader.readFirstSheet({ name: 'datos.xlsx', bytes: new Uint8Array(buffer) });

    expect(rows[1]?.[0]).toBe('12.3');
    expect(rows[1]?.[1]).toMatch(/^2026-11-2[34]T/);
    expect(rows[1]?.[2] ?? null).toBeNull();
  });

  it('de una fórmula usa el valor guardado (nunca la evalúa)', async () => {
    const bytes = handMadeXlsx(
      `<row r="1">${inline('A1', 'codigo')}${inline('B1', 'nombre')}</row><row r="2">${inline('A2', 'P1')}<c r="B2"><f>1+1</f><v>2</v></c></row>`,
    );

    const rows = await reader.readFirstSheet({ name: 'f.xlsx', bytes });

    expect(rows[1]).toEqual(['P1', '2']);
  });

  it('conserva la numeración: una fila vacía intermedia sigue ocupando su lugar', async () => {
    const bytes = handMadeXlsx(
      `<row r="1">${inline('A1', 'codigo')}</row><row r="2">${inline('A2', 'P1')}</row><row r="4">${inline('A4', 'P3')}</row>`,
    );

    const rows = await reader.readFirstSheet({ name: 'v.xlsx', bytes });

    expect(rows[0]?.[0]).toBe('codigo');
    expect(rows[1]?.[0]).toBe('P1');
    expect((rows[2] ?? []).every((cell) => cell === null)).toBe(true);
    expect(rows[3]?.[0]).toBe('P3');
  });

  it('corta las celdas muy largas; 30 columnas valen y 31 → too_many_columns', async () => {
    const sheet = (count: number) => {
      const wide = Array.from({ length: count }, (_, i) => inline(`${colName(i)}1`, `h${i}`)).join(
        '',
      );
      return handMadeXlsx(
        `<row r="1">${wide}</row><row r="2">${inline('A2', 'x'.repeat(3000))}</row>`,
      );
    };

    const rows = await reader.readFirstSheet({ name: 'g.xlsx', bytes: sheet(30) });
    expect(rows[0]).toHaveLength(SPREADSHEET_LIMITS.maxColumns);
    expect(rows[1]?.[0]).toHaveLength(SPREADSHEET_LIMITS.maxCellChars);

    expect(await rejectionReason(reader.readFirstSheet({ name: 'g.xlsx', bytes: sheet(31) }))).toBe(
      'too_many_columns',
    );
  });

  it('un zip que declara más de 30 MB descomprimidos → file_too_large', async () => {
    // 31 MB de ceros comprimen a unos 30 KB: pasa los 2 MB pero no los 30 MB descomprimidos.
    const bomb = handMadeXlsx('<row r="1"/>', {
      'xl/relleno.xml': new Uint8Array(31 * 1024 * 1024),
    });
    expect(bomb.byteLength).toBeLessThan(SPREADSHEET_LIMITS.maxFileBytes);

    expect(await rejectionReason(reader.readFirstSheet({ name: 'b.xlsx', bytes: bomb }))).toBe(
      'file_too_large',
    );
  });

  it('un zip con más de 100 entradas → file_too_large', async () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 101; i += 1) files[`xl/extra${i}.xml`] = strToU8('<a/>');

    expect(
      await rejectionReason(
        reader.readFirstSheet({ name: 'm.xlsx', bytes: handMadeXlsx('<row r="1"/>', files) }),
      ),
    ).toBe('file_too_large');
  });

  it('un .xlsx que no es un zip → file_unsupported; un zip dañado → file_unreadable', async () => {
    const fake = strToU8('esto no es un excel');
    expect(await rejectionReason(reader.readFirstSheet({ name: 'x.xlsx', bytes: fake }))).toBe(
      'file_unsupported',
    );

    const broken = handMadeXlsx('<row r="1"/>').slice(0, 200);
    expect(await rejectionReason(reader.readFirstSheet({ name: 'y.xlsx', bytes: broken }))).toBe(
      'file_unreadable',
    );
  });

  it('un zip válido que no es un libro de Excel → file_unreadable', async () => {
    const zip = zipSync({ 'hola.txt': strToU8('hola') });
    expect(await rejectionReason(reader.readFirstSheet({ name: 'z.xlsx', bytes: zip }))).toBe(
      'file_unreadable',
    );
  });
});

function colName(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return index < 26 ? (letters[index] ?? '') : `A${letters[index - 26] ?? ''}`;
}

const CONTENT_TYPES =
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>';
const WORKBOOK =
  '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>';
const WORKBOOK_RELS =
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';

/**
 * Zip escrito a mano con data descriptor (flag 0x08: tamaños en 0 en la cabecera local) y,
 * opcionalmente, un directorio central que MIENTE sobre el tamaño descomprimido (fflate con
 * unzipSync lo cree; una librería que descomprime por cabeceras locales no).
 */
function descriptorZip(
  entries: Record<string, Uint8Array>,
  declaredOriginalSize?: number,
): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.from(content);
    const compressed = deflateRawSync(data, { level: 9 });
    const nameBytes = Buffer.from(name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x08, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(nameBytes.length, 26);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(compressed.length, 8);
    descriptor.writeUInt32LE(data.length, 12);
    local.push(header, nameBytes, compressed, descriptor);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x08, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(declaredOriginalSize ?? data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + compressed.length + 16;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, directory, end]));
}

function bookEntries(sheetXml: string): Record<string, Uint8Array> {
  return {
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    'xl/workbook.xml': strToU8(WORKBOOK),
    'xl/_rels/workbook.xml.rels': strToU8(WORKBOOK_RELS),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  };
}

const worksheet = (body: string, extra = '') =>
  `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${extra}<sheetData>${body}</sheetData></worksheet>`;

describe('SpreadsheetReader · .xlsx hostiles (zip bombs y hojas dispersas)', () => {
  it('data descriptor y directorio central que miente → file_too_large, rápido', async () => {
    // 60 MB de espacios en la hoja: el directorio central declara 100 bytes.
    const sheet = `<?xml version="1.0"?><worksheet><sheetData><row r="1">${inline('A1', 'x')}</row></sheetData>${' '.repeat(60 * 1024 * 1024)}</worksheet>`;
    const bomb = descriptorZip(bookEntries(sheet), 100);
    expect(bomb.byteLength).toBeLessThan(SPREADSHEET_LIMITS.maxFileBytes);

    const started = Date.now();
    expect(await rejectionReason(reader.readFirstSheet({ name: 'b.xlsx', bytes: bomb }))).toBe(
      'file_too_large',
    );
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('un zip honesto con data descriptor se lee bien', async () => {
    const bytes = descriptorZip(
      bookEntries(worksheet(`<row r="1">${inline('A1', 'codigo')}</row>`)),
    );

    const rows = await reader.readFirstSheet({ name: 'd.xlsx', bytes });

    expect(rows[0]).toEqual(['codigo']);
  });

  it('descarta las entradas que no son XML (imágenes, macros) sin descomprimirlas', async () => {
    const bytes = zipSync({
      ...bookEntries(worksheet(`<row r="1">${inline('A1', 'ok')}</row>`)),
      'xl/media/image1.png': new Uint8Array(40 * 1024 * 1024),
      'xl/vbaProject.bin': new Uint8Array(40 * 1024 * 1024),
    });

    const rows = await reader.readFirstSheet({ name: 'i.xlsx', bytes });

    expect(rows[0]).toEqual(['ok']);
  });

  it.each([
    ['XFD1048576 (la última celda)', 'XFD1048576', 'too_many_rows'],
    ['Z100000 (fila 100,000)', 'Z100000', 'too_many_rows'],
    ['XFD1 (columna 16,384)', 'XFD1', 'too_many_columns'],
  ])('hoja dispersa con %s → rechazada rápido', async (_name, ref, reason) => {
    const row = ref.replace(/[A-Z]+/, '');
    const bytes = handMadeXlsx(
      `<row r="1">${inline('A1', 'x')}</row><row r="${row}">${inline(ref, 'y')}</row>`,
    );

    const started = Date.now();
    expect(await rejectionReason(reader.readFirstSheet({ name: 's.xlsx', bytes }))).toBe(reason);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('un <dimension> enorme sin celdas lejanas también se rechaza', async () => {
    const bytes = zipSync(
      bookEntries(
        worksheet(`<row r="1">${inline('A1', 'x')}</row>`, '<dimension ref="A1:XFD1048576"/>'),
      ),
    );
    expect(await rejectionReason(reader.readFirstSheet({ name: 'd.xlsx', bytes }))).toBe(
      'too_many_rows',
    );
  });

  it('filas vacías al final dentro del margen todavía se leen', async () => {
    const last = SPREADSHEET_LIMITS.maxDataRows + 1 + SPREADSHEET_LIMITS.emptyRowsMargin;
    const bytes = handMadeXlsx(`<row r="1">${inline('A1', 'x')}</row><row r="${last}"/>`);

    const rows = await reader.readFirstSheet({ name: 'm.xlsx', bytes });

    expect(rows[0]).toEqual(['x']);
  });
});

describe('SpreadsheetReader · números de Excel', () => {
  const numeric = async (value: string) => {
    const bytes = handMadeXlsx(`<row r="1"><c r="A1"><v>${value}</v></c></row>`);
    const rows = await reader.readFirstSheet({ name: 'n.xlsx', bytes });
    return rows[0]?.[0];
  };

  it.each([
    ['19.989999999999998', '19.99'],
    ['1E-3', '0.001'],
    ['1.5E+2', '150'],
    ['12.3', '12.3'],
    ['100', '100'],
    ['1E+20', '100000000000000000000'],
    ['0.1', '0.1'],
  ])('%s → %s (decimal exacto, 15 cifras, sin exponente)', async (raw, expected) => {
    expect(await numeric(raw)).toBe(expected);
  });

  it('un exponente absurdo no se expande', async () => {
    expect(await numeric('1E+999999')).toBe('1E+999999');
  });
});

describe('SpreadsheetReader · tipos y límites', () => {
  it('.xls, .xlsm y otras extensiones → file_unsupported', async () => {
    const bytes = strToU8('a,b');
    for (const name of ['v.xls', 'm.xlsm', 'notas.txt', 'sin-extension']) {
      expect(await rejectionReason(reader.readFirstSheet({ name, bytes }))).toBe(
        'file_unsupported',
      );
    }
  });

  it('un archivo antiguo (OLE2) con extensión .csv o .xlsx → file_unsupported', async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0]);
    expect(await rejectionReason(reader.readFirstSheet({ name: 'a.csv', bytes: ole }))).toBe(
      'file_unsupported',
    );
    expect(await rejectionReason(reader.readFirstSheet({ name: 'a.xlsx', bytes: ole }))).toBe(
      'file_unsupported',
    );
  });

  it('un zip con extensión .csv → file_unsupported', async () => {
    const zip = zipSync({ 'a.txt': strToU8('a') });
    expect(await rejectionReason(reader.readFirstSheet({ name: 'a.csv', bytes: zip }))).toBe(
      'file_unsupported',
    );
  });

  it('más de 2 MB → file_too_large; vacío → file_unreadable', async () => {
    const big = new Uint8Array(SPREADSHEET_LIMITS.maxFileBytes + 1).fill(0x61);
    expect(await rejectionReason(reader.readFirstSheet({ name: 'g.csv', bytes: big }))).toBe(
      'file_too_large',
    );
    expect(
      await rejectionReason(reader.readFirstSheet({ name: 'v.csv', bytes: new Uint8Array() })),
    ).toBe('file_unreadable');
  });
});

describe('SpreadsheetReader · .csv', () => {
  it('UTF-8 con BOM: quita el BOM y lee las tildes', async () => {
    const rows = await reader.readFirstSheet({
      name: 'a.csv',
      bytes: new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8('codigo,nombre\nP1,Pañería\n')]),
    });

    expect(rows[0]).toEqual(['codigo', 'nombre']);
    expect(rows[1]).toEqual(['P1', 'Pañería']);
  });

  it('windows-1252 (Excel en español): la ñ y las tildes salen bien', async () => {
    // "Pañal;Línea" en windows-1252: ñ = 0xF1, í = 0xED.
    const bytes = new Uint8Array([
      ...strToU8('codigo;nombre\nP1;Pa'),
      0xf1,
      ...strToU8('al L'),
      0xed,
      ...strToU8('nea\n'),
    ]);

    const rows = await reader.readFirstSheet({ name: 'a.csv', bytes });

    expect(rows[1]).toEqual(['P1', 'Pañal Línea']);
  });

  it.each([
    ['coma', 'a,b,c\n1,2,3'],
    ['punto y coma', 'a;b;c\n1;2;3'],
    ['tabulador', 'a\tb\tc\n1\t2\t3'],
  ])('detecta el delimitador: %s', async (_name, text) => {
    const rows = await reader.readFirstSheet(csv(text));
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('conserva las filas vacías (numeración), vacía → null y recorta espacios', async () => {
    const rows = await reader.readFirstSheet(csv('codigo,nombre\n\n P1 ,  \n"a,b",c\n'));

    expect(rows[0]).toEqual(['codigo', 'nombre']);
    expect((rows[1] ?? []).every((cell) => cell === null)).toBe(true);
    expect(rows[2]).toEqual(['P1', null]);
    expect(rows[3]).toEqual(['a,b', 'c']);
  });

  it('2 MB de saltos de línea → too_many_rows, rápido', async () => {
    const bytes = strToU8(`a,b\n${'\n'.repeat(2 * 1024 * 1024 - 4)}`);

    const started = Date.now();
    expect(await rejectionReason(reader.readFirstSheet({ name: 'n.csv', bytes }))).toBe(
      'too_many_rows',
    );
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('comillas sin cerrar → file_unreadable', async () => {
    expect(await rejectionReason(reader.readFirstSheet(csv('a,b\n"x,y\n')))).toBe(
      'file_unreadable',
    );
  });
});
