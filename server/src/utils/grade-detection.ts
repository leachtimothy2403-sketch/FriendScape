export const FRENCH_GRADES = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6ème', '5ème', '4ème', '3ème'];
export const US_GRADES = ['Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade', '5th Grade', '6th Grade', '7th Grade', '8th Grade', '9th Grade'];

const FRENCH_MATCH_TOKENS = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6ème', '6eme', '5ème', '5eme', '4ème', '4eme', '3ème', '3eme'];
const US_MATCH_MAP: Record<string, string> = {
  'kindergarten': 'Kindergarten',
  '1st grade': '1st Grade', 'first grade': '1st Grade',
  '2nd grade': '2nd Grade', 'second grade': '2nd Grade',
  '3rd grade': '3rd Grade', 'third grade': '3rd Grade',
  '4th grade': '4th Grade', 'fourth grade': '4th Grade',
  '5th grade': '5th Grade', 'fifth grade': '5th Grade',
  '6th grade': '6th Grade', 'sixth grade': '6th Grade',
  '7th grade': '7th Grade', 'seventh grade': '7th Grade',
  '8th grade': '8th Grade', 'eighth grade': '8th Grade',
  '9th grade': '9th Grade', 'ninth grade': '9th Grade',
};

function normaliseFrench(raw: string): string {
  const map: Record<string, string> = {
    '6eme': '6ème', '5eme': '5ème', '4eme': '4ème', '3eme': '3ème',
    '6ème': '6ème', '5ème': '5ème', '4ème': '4ème', '3ème': '3ème',
  };
  return map[raw] ?? raw.toUpperCase();
}

export function detectGrade(text: string, language: 'en' | 'fr'): string | null {
  const lower = text.toLowerCase().replace(/[èé]/g, 'e');
  if (language === 'fr') {
    const found = FRENCH_MATCH_TOKENS.find((g) => lower.includes(g.toLowerCase().replace(/[èé]/g, 'e')));
    return found ? normaliseFrench(found) : null;
  }
  const found = Object.keys(US_MATCH_MAP).find((g) => lower.includes(g));
  return found ? US_MATCH_MAP[found] : null;
}

export function gradeOptionsList(language: 'en' | 'fr'): string {
  return (language === 'fr' ? FRENCH_GRADES : US_GRADES).join(', ');
}
