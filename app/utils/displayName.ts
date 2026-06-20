export function getDisplayName(name: string, isFr: boolean): string {
  if (isFr && name === 'Ms. Luna') return 'Mme Luna';
  return name;
}
