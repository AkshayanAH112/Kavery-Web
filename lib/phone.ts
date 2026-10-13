/** Guardian numbers are local: ten digits starting with 0. Mirrors the server rule in lib/keda/server.ts. */
export function isValidPhoneLocal(value: string): boolean {
  return /^0\d{9}$/.test(value.replace(/[\s-]/g, ""));
}

export const PHONE_HINT = "Enter a valid 10-digit phone number starting with 0 (e.g. 0701212234)";
