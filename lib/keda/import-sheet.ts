/**
 * Finds students in a spreadsheet wherever they sit: any cell holding an index
 * number, with the name in the cell to its right.
 *
 * KEDA's lists run in two or more side-by-side column pairs under merged
 * headings, so reading "column A and column B" would miss half the class. This
 * looks at every cell instead and does not care where the pairs are.
 *
 * Pure (no spreadsheet library here): it takes rows of cell values.
 */
export const INDEX_NUMBER = /^KEDA\/\d{2}\/\d{4,}$/;

export type SheetStudent = { registrationNumber: string; original: string };

export function findStudents(rows: unknown[][]): SheetStudent[] {
  const found = new Map<string, SheetStudent>();
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      const value = typeof row[c] === "string" ? (row[c] as string).trim() : "";
      if (!INDEX_NUMBER.test(value) || found.has(value)) continue;
      const neighbour = row[c + 1];
      found.set(value, { registrationNumber: value, original: typeof neighbour === "string" ? neighbour.trim() : "" });
    }
  }
  return [...found.values()].sort((a, b) => a.registrationNumber.localeCompare(b.registrationNumber, undefined, { numeric: true }));
}
