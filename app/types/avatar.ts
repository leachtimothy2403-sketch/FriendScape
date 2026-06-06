export interface AvatarConfig {
  faceShape:    'oval' | 'round' | 'square' | 'heart' | 'diamond';
  skinTone:     string; // hex
  hairStyle:    'short' | 'medium' | 'long' | 'curly' | 'braids' | 'ponytail' | 'bun' | 'afro' | 'shaved';
  hairColour:   string; // hex
  eyeShape:     'round' | 'almond' | 'wide' | 'hooded' | 'upturned';
  eyeColour:    string; // hex
  eyebrowStyle: 'thin' | 'normal' | 'thick' | 'arched';
  noseStyle:    'soft' | 'button' | 'broad' | 'narrow' | 'upturned';
  mouthStyle:   'bigsmile' | 'smile' | 'neutral' | 'cheeky';
  glasses:      'none' | 'round' | 'square' | 'heart' | 'sporty';
  hat:          'none' | 'cap' | 'beanie' | 'crown' | 'flowerclip';
  earrings:     'none' | 'studs' | 'hoops' | 'stars';
  freckles:     boolean;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  faceShape:    'oval',
  skinTone:     '#F5C5A3',
  hairStyle:    'medium',
  hairColour:   '#2C1810',
  eyeShape:     'almond',
  eyeColour:    '#4A90D9',
  eyebrowStyle: 'normal',
  noseStyle:    'soft',
  mouthStyle:   'smile',
  glasses:      'none',
  hat:          'none',
  earrings:     'none',
  freckles:     false,
};

export const SKIN_TONES = [
  '#FDDBB4', '#F5C5A3', '#E8A87C',
  '#C68642', '#8D5524', '#4A2912',
];

export const HAIR_COLOURS = [
  '#2C1810', '#6B3A2A', '#B5651D',
  '#D4A017', '#F5DEB3', '#1C1C1C',
  '#808080', '#FF69B4', '#9B59B6', '#4169E1',
];

export const EYE_COLOURS = [
  '#4A90D9', '#2E7D32', '#795548',
  '#37474F', '#1565C0', '#6A1B9A',
];

export const BACKGROUND_COLOURS = [
  '#EEEDFE', '#E1F5EE', '#FAEEDA',
  '#FAECE7', '#E6F1FB', '#FDE8F3',
  '#F0F4C3', '#E0F7FA',
];
