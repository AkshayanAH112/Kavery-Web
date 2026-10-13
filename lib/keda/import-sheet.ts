/**
 * Finds students in a spreadsheet wherever they sit: any cell holding an index
 * number, with the name in the cell to its right.
 *
 * KEDA's lists run in two or more side-by-side column pairs under merged
 * headings, so reading "column A and column B" would miss half the class. This
 * looks at every cell instead and does not care where the pairs are.
 *
 * Only the index number and the name are taken; every other column is ignored.
 * A list is numbered ahead of the students who will fill it, so an index number
 * with no name beside it is not a student and is left out (`unnamed` counts them).
 *
 * Pure (no spreadsheet library here): it takes rows of cell values.
 */
export const INDEX_NUMBER = /^KEDA\/\d{2}\/\d{4,}$/;

export type SheetStudent = { registrationNumber: string; original: string };

export function findStudents(rows: unknown[][]): { students: SheetStudent[]; unnamed: number } {
  const found = new Map<string, SheetStudent>();
  const numbers = new Set<string>();
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      const value = typeof row[c] === "string" ? (row[c] as string).trim() : "";
      if (!INDEX_NUMBER.test(value)) continue;
      numbers.add(value);
      const neighbour = row[c + 1];
      const original = typeof neighbour === "string" ? neighbour.trim() : "";
      if (original && !found.has(value)) found.set(value, { registrationNumber: value, original });
    }
  }
  const students = [...found.values()].sort((a, b) => a.registrationNumber.localeCompare(b.registrationNumber, undefined, { numeric: true }));
  return { students, unnamed: numbers.size - students.length };
}
