export const ACCESS_COOKIE = "simo_access";

export function isAccessPasswordValid(password: string): boolean {
  const expected = (process.env.ACCESS_PASSWORD ?? "mickey").toLowerCase();
  return password.trim().toLowerCase() === expected;
}
