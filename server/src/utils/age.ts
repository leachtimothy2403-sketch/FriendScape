export function ageFromDob(dob: string | Date | null | undefined, fallback = 8): number {
  if (!dob) return fallback;
  const born = new Date(dob);
  if (isNaN(born.getTime())) return fallback;
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const m = today.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < born.getDate())) age--;
  return age;
}
