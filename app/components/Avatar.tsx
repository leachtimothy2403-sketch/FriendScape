import React from 'react';
import Svg, {
  G, Circle, Ellipse, Rect, Path, Line,
  Defs, LinearGradient, Stop,
} from 'react-native-svg';
import type { StyleProp, ViewStyle } from 'react-native';
import type { AvatarConfig } from '@/types/avatar';

export interface AvatarProps {
  config: AvatarConfig;
  background?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function lightenHex(hex: string, f: number): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const c = (v: number) => Math.round(v + (255 - v) * f).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function darkenHex(hex: string, f: number): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const c = (v: number) => Math.round(v * (1 - f)).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function starPath(cx: number, cy: number, outer: number, inner: number, pts: number): string {
  let d = '';
  for (let i = 0; i < pts * 2; i++) {
    const a = (i * Math.PI) / pts - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    d += `${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)} `;
  }
  return d + 'Z';
}

// ─── Layer components ─────────────────────────────────────────────────────────

function Face({ shape, skin }: { shape: AvatarConfig['faceShape']; skin: string }) {
  switch (shape) {
    case 'oval':    return <Ellipse cx={100} cy={115} rx={72} ry={88} fill={skin} />;
    case 'round':   return <Circle cx={100} cy={110} r={82} fill={skin} />;
    case 'square':  return <Rect x={28} y={32} width={144} height={156} rx={30} fill={skin} />;
    case 'heart':   return <Path d="M100,60 C60,20 20,60 20,100 C20,148 60,178 100,200 C140,178 180,148 180,100 C180,60 140,20 100,60" fill={skin} />;
    case 'diamond': return <Path d="M100,30 L168,110 L100,196 L32,110 Z" fill={skin} />;
  }
}

function EyePair({ shape, eyeColour, skinTone }: { shape: AvatarConfig['eyeShape']; eyeColour: string; skinTone: string }) {
  const dims: Record<AvatarConfig['eyeShape'], [number, number]> = {
    almond:   [18, 12],
    round:    [14, 14],
    wide:     [20, 15],
    hooded:   [18, 12],
    upturned: [18, 12],
  };
  const [rx, ry] = dims[shape];

  const SingleEye = ({ cx }: { cx: number }) => {
    const rot = shape === 'upturned' ? `rotate(-10, ${cx}, 100)` : undefined;
    return (
      <G transform={rot}>
        <Ellipse cx={cx} cy={100} rx={rx} ry={ry} fill="white" />
        {shape === 'hooded' && (
          <Path
            d={`M${cx - rx},97 Q${cx},88 ${cx + rx},97`}
            fill={skinTone}
            opacity={0.6}
          />
        )}
        <Circle cx={cx} cy={100} r={9} fill={eyeColour} />
        <Circle cx={cx} cy={100} r={5} fill="#111111" />
        <Circle cx={cx + 3} cy={97} r={2.5} fill="white" />
      </G>
    );
  };

  return (
    <G>
      <SingleEye cx={72} />
      <SingleEye cx={128} />
    </G>
  );
}

function Eyebrows({ style, browColor }: { style: AvatarConfig['eyebrowStyle']; browColor: string }) {
  const p = { stroke: browColor, strokeLinecap: 'round' as const, fill: 'none' };
  switch (style) {
    case 'thin':
      return (
        <G>
          <Path d="M60,82 Q72,78 84,82" {...p} strokeWidth={1.5} />
          <Path d="M116,82 Q128,78 140,82" {...p} strokeWidth={1.5} />
        </G>
      );
    case 'thick':
      return (
        <G>
          <Path d="M58,80 Q72,74 86,80" {...p} strokeWidth={4} />
          <Path d="M114,80 Q128,74 142,80" {...p} strokeWidth={4} />
        </G>
      );
    case 'arched':
      return (
        <G>
          <Path d="M60,84 Q72,68 84,80" {...p} strokeWidth={2.5} />
          <Path d="M116,80 Q128,68 140,84" {...p} strokeWidth={2.5} />
        </G>
      );
    default: // normal
      return (
        <G>
          <Path d="M58,80 Q72,74 86,80" {...p} strokeWidth={2.5} />
          <Path d="M114,80 Q128,74 142,80" {...p} strokeWidth={2.5} />
        </G>
      );
  }
}

function Nose({ style, shade }: { style: AvatarConfig['noseStyle']; shade: string }) {
  const p = { stroke: shade, fill: 'none', strokeLinecap: 'round' as const, strokeWidth: 1.5 };
  switch (style) {
    case 'button':   return <Circle cx={100} cy={135} r={4} fill={shade} opacity={0.38} />;
    case 'broad':    return <Path d="M90,125 C88,130 90,140 100,140 C110,140 112,130 110,125" {...p} />;
    case 'narrow':   return <Path d="M97,125 C95,130 97,138 100,138 C103,138 105,130 103,125" {...p} />;
    case 'upturned': return <Path d="M94,134 C93,128 100,124 100,124 C100,124 107,128 106,134" {...p} />;
    default:         return <Path d="M95,125 C93,130 95,138 100,138 C105,138 107,130 105,125" {...p} />;
  }
}

function Mouth({ style }: { style: AvatarConfig['mouthStyle'] }) {
  const p = { stroke: '#D45B5B', strokeLinecap: 'round' as const, fill: 'none', strokeWidth: 2.5 };
  switch (style) {
    case 'bigsmile':
      return (
        <G>
          <Path d="M74,158 Q100,180 126,158" {...p} />
          <Path d="M74,158 Q100,176 126,158" fill="#FFB3B3" stroke="none" opacity={0.3} />
        </G>
      );
    case 'neutral': return <Line x1={84} y1={162} x2={116} y2={162} stroke="#D45B5B" strokeWidth={2} strokeLinecap="round" />;
    case 'cheeky':  return <Path d="M82,160 Q106,170 118,156" {...p} />;
    default:        return <Path d="M82,158 Q100,172 118,158" {...p} />;
  }
}

function Freckles() {
  const f = { fill: '#C68642', opacity: 0.38 };
  return (
    <G>
      <Circle cx={84} cy={120} r={2.5} {...f} />
      <Circle cx={94} cy={123} r={2.5} {...f} />
      <Circle cx={106} cy={123} r={2.5} {...f} />
      <Circle cx={116} cy={120} r={2.5} {...f} />
      <Circle cx={78} cy={127} r={2} {...f} />
      <Circle cx={122} cy={127} r={2} {...f} />
      <Circle cx={100} cy={118} r={2} {...f} />
    </G>
  );
}

const CAP = 'M26,112 C26,38 174,38 174,112 L160,80 C145,68 55,68 40,80 Z';
const SIDE_L = 'M26,112 L18,178 Q32,185 44,178 L44,80 C38,75 26,85 26,112 Z';
const SIDE_R = 'M174,112 L182,178 Q168,185 156,178 L156,80 C162,75 174,85 174,112 Z';

function HairBack({ style, color, gid }: { style: AvatarConfig['hairStyle']; color: string; gid: string }) {
  const fill = `url(#${gid})`;
  switch (style) {
    case 'long':
      return (
        <G>
          <Rect x={16} y={95} width={32} height={148} rx={15} fill={fill} />
          <Rect x={152} y={95} width={32} height={148} rx={15} fill={fill} />
        </G>
      );
    case 'braids':
      return (
        <G>
          <Rect x={28} y={150} width={22} height={100} rx={11} fill={fill} />
          <Rect x={150} y={150} width={22} height={100} rx={11} fill={fill} />
        </G>
      );
    case 'ponytail':
      return (
        <G>
          <Circle cx={182} cy={88} r={26} fill={fill} />
          <Rect x={162} y={76} width={30} height={22} rx={11} fill={color} />
        </G>
      );
    case 'afro':
      return <Circle cx={100} cy={88} r={95} fill={fill} />;
    default:
      return null;
  }
}

function HairFront({ style, color, gid }: { style: AvatarConfig['hairStyle']; color: string; gid: string }) {
  const fill = `url(#${gid})`;
  const braid = lightenHex(color, 0.28);

  switch (style) {
    case 'shaved':
      return <Path d="M34,95 C34,40 166,40 166,95 L154,78 C144,54 56,54 46,78 Z" fill={fill} />;

    case 'short':
      return <Path d={CAP} fill={fill} />;

    case 'medium':
      return (
        <G>
          <Path d={CAP} fill={fill} />
          <Path d={SIDE_L} fill={color} />
          <Path d={SIDE_R} fill={color} />
        </G>
      );

    case 'long':
      return (
        <G>
          <Path d={CAP} fill={fill} />
          <Path d="M26,112 L16,243 Q32,249 48,243 L48,80 C38,75 26,85 26,112 Z" fill={color} />
          <Path d="M174,112 L184,243 Q168,249 152,243 L152,80 C162,75 174,85 174,112 Z" fill={color} />
        </G>
      );

    case 'curly': {
      const curlCap = 'M100,20 C78,8 54,14 40,30 C26,46 28,66 26,82 L40,80 C55,46 145,46 160,80 L174,82 C172,66 174,46 160,30 C146,14 122,8 100,20 Z';
      return (
        <G>
          <Path d={curlCap} fill={fill} />
          <Circle cx={24} cy={106} r={18} fill={color} />
          <Circle cx={20} cy={128} r={16} fill={color} />
          <Circle cx={22} cy={150} r={14} fill={color} />
          <Circle cx={176} cy={106} r={18} fill={color} />
          <Circle cx={180} cy={128} r={16} fill={color} />
          <Circle cx={178} cy={150} r={14} fill={color} />
        </G>
      );
    }

    case 'braids':
      return (
        <G>
          <Path d={CAP} fill={fill} />
          {([170, 190, 210] as number[]).map((y) => (
            <G key={y}>
              <Line x1={28} y1={y} x2={50} y2={y} stroke={braid} strokeWidth={2} />
              <Line x1={150} y1={y} x2={172} y2={y} stroke={braid} strokeWidth={2} />
            </G>
          ))}
        </G>
      );

    case 'ponytail':
      return (
        <G>
          <Path d={CAP} fill={fill} />
          <Path d={SIDE_L} fill={color} />
        </G>
      );

    case 'bun':
      return (
        <G>
          <Path d={CAP} fill={fill} />
          <Circle cx={100} cy={30} r={24} fill={fill} />
          <Circle cx={100} cy={30} r={8} fill={lightenHex(color, 0.14)} />
          <Path d={SIDE_L} fill={color} />
          <Path d={SIDE_R} fill={color} />
        </G>
      );

    case 'afro':
      return (
        <G>
          <Circle cx={100} cy={88} r={95} fill={fill} />
          <Path d={CAP} fill={fill} />
        </G>
      );

    default:
      return null;
  }
}

function Glasses({ style }: { style: AvatarConfig['glasses'] }) {
  if (style === 'none') return null;
  const fc = '#333333';
  const sw = 2;
  const Arms = () => (
    <G>
      <Line x1={50} y1={100} x2={26} y2={112} stroke={fc} strokeWidth={1.5} />
      <Line x1={150} y1={100} x2={174} y2={112} stroke={fc} strokeWidth={1.5} />
    </G>
  );

  switch (style) {
    case 'round':
      return (
        <G>
          <Circle cx={72} cy={100} r={22} stroke={fc} strokeWidth={sw} fill="none" />
          <Circle cx={128} cy={100} r={22} stroke={fc} strokeWidth={sw} fill="none" />
          <Line x1={94} y1={100} x2={106} y2={100} stroke={fc} strokeWidth={sw} />
          <Arms />
        </G>
      );
    case 'square':
      return (
        <G>
          <Rect x={50} y={88} width={44} height={24} rx={4} stroke={fc} strokeWidth={sw} fill="none" />
          <Rect x={106} y={88} width={44} height={24} rx={4} stroke={fc} strokeWidth={sw} fill="none" />
          <Line x1={94} y1={100} x2={106} y2={100} stroke={fc} strokeWidth={sw} />
          <Arms />
        </G>
      );
    case 'heart':
      return (
        <G>
          <Path d="M72,90 C72,83 62,83 62,92 C62,102 72,112 72,112 C72,112 82,102 82,92 C82,83 72,83 72,90 Z" stroke="#FF69B4" strokeWidth={sw} fill="none" />
          <Path d="M128,90 C128,83 118,83 118,92 C118,102 128,112 128,112 C128,112 138,102 138,92 C138,83 128,83 128,90 Z" stroke="#FF69B4" strokeWidth={sw} fill="none" />
          <Line x1={94} y1={100} x2={106} y2={100} stroke="#FF69B4" strokeWidth={sw} />
          <Arms />
        </G>
      );
    case 'sporty':
      return (
        <G>
          <Path d="M46,96 Q60,82 100,82 Q140,82 154,96 L150,108 Q140,120 100,120 Q60,120 50,108 Z" stroke={fc} strokeWidth={sw} fill="none" opacity={0.75} />
          <Arms />
        </G>
      );
    default:
      return null;
  }
}

function Earrings({ style }: { style: AvatarConfig['earrings'] }) {
  if (style === 'none') return null;
  const gold = '#FFD700';
  switch (style) {
    case 'studs':
      return (
        <G>
          <Circle cx={16} cy={128} r={4} fill={gold} />
          <Circle cx={184} cy={128} r={4} fill={gold} />
        </G>
      );
    case 'hoops':
      return (
        <G>
          <Circle cx={16} cy={130} r={8} stroke={gold} strokeWidth={2.5} fill="none" />
          <Circle cx={184} cy={130} r={8} stroke={gold} strokeWidth={2.5} fill="none" />
        </G>
      );
    case 'stars':
      return (
        <G>
          <Path d={starPath(16, 128, 7, 3, 5)} fill={gold} />
          <Path d={starPath(184, 128, 7, 3, 5)} fill={gold} />
        </G>
      );
    default:
      return null;
  }
}

function Hat({ style, hairColor }: { style: AvatarConfig['hat']; hairColor: string }) {
  if (style === 'none') return null;
  switch (style) {
    case 'cap': {
      const cc = darkenHex(hairColor, 0.08);
      return (
        <G>
          <Path d="M28,95 C28,38 172,38 172,95 L160,80 Q100,66 40,80 Z" fill={cc} />
          <Path d="M20,93 Q8,100 6,110 Q14,116 44,112 L58,100 Q28,97 20,93 Z" fill={darkenHex(cc, 0.1)} />
          <Line x1={28} y1={91} x2={172} y2={91} stroke={darkenHex(cc, 0.18)} strokeWidth={3} />
        </G>
      );
    }
    case 'beanie': {
      const bc = darkenHex(hairColor, 0.06);
      return (
        <G>
          <Path d="M24,108 C24,34 176,34 176,108 L160,80 Q100,65 40,80 Z" fill={bc} />
          <Circle cx={100} cy={28} r={10} fill={bc} />
          <Rect x={24} y={76} width={152} height={14} rx={7} fill={darkenHex(bc, 0.1)} />
          {([52, 76, 100, 124, 148] as number[]).map((x) => (
            <Line key={x} x1={x} y1={46} x2={x} y2={76} stroke={darkenHex(bc, 0.14)} strokeWidth={2} strokeLinecap="round" />
          ))}
        </G>
      );
    }
    case 'crown':
      return (
        <G>
          <Path d="M55,85 L68,54 L100,70 L132,54 L145,85 Z" fill="#FFD700" stroke="#E8B800" strokeWidth={1.5} />
          <Rect x={55} y={83} width={90} height={8} rx={4} fill="#F0C800" />
          <Circle cx={68} cy={54} r={5} fill="#FF6B6B" />
          <Circle cx={100} cy={65} r={5} fill="#4ECDC4" />
          <Circle cx={132} cy={54} r={5} fill="#FF6B6B" />
        </G>
      );
    case 'flowerclip': {
      const pc = '#FFB6C1';
      const [cx, cy] = [28, 72];
      return (
        <G>
          <Circle cx={cx}     cy={cy - 9} r={5} fill={pc} />
          <Circle cx={cx + 8} cy={cy - 4} r={5} fill={pc} />
          <Circle cx={cx + 8} cy={cy + 4} r={5} fill={pc} />
          <Circle cx={cx - 8} cy={cy - 4} r={5} fill={pc} />
          <Circle cx={cx - 8} cy={cy + 4} r={5} fill={pc} />
          <Circle cx={cx}     cy={cy}     r={7} fill="#FFCDD2" />
          <Circle cx={cx}     cy={cy}     r={4} fill="#FF8A80" />
        </G>
      );
    }
    default:
      return null;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Avatar({ config, background = '#EEEDFE', size = 64, style }: AvatarProps) {
  const { skinTone, hairColour, eyeColour } = config;
  const skinShade  = darkenHex(skinTone, 0.12);
  const browColor  = darkenHex(hairColour, 0.15);
  const gid        = `hg${hairColour.replace('#', '')}`;

  return (
    <Svg
      width={size}
      height={Math.round(size * 220 / 200)}
      viewBox="0 0 200 220"
      style={style}
    >
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor={lightenHex(hairColour, 0.18)} stopOpacity="1" />
          <Stop offset="1"   stopColor={hairColour}                   stopOpacity="1" />
        </LinearGradient>
      </Defs>

      {/* 1. Background */}
      <Circle cx={100} cy={110} r={108} fill={background} />

      {/* 2. Hair back */}
      <HairBack style={config.hairStyle} color={hairColour} gid={gid} />

      {/* 3. Face */}
      <Face shape={config.faceShape} skin={skinTone} />

      {/* 4. Ears */}
      <Ellipse cx={26}  cy={112} rx={10} ry={16} fill={skinTone} />
      <Ellipse cx={24}  cy={112} rx={5}  ry={10} fill={skinShade} opacity={0.28} />
      <Ellipse cx={174} cy={112} rx={10} ry={16} fill={skinTone} />
      <Ellipse cx={176} cy={112} rx={5}  ry={10} fill={skinShade} opacity={0.28} />

      {/* 5. Neck */}
      <Rect x={86} y={196} width={28} height={24} fill={skinTone} rx={4} />

      {/* 6. Eyes */}
      <EyePair shape={config.eyeShape} eyeColour={eyeColour} skinTone={skinTone} />

      {/* 7. Eyebrows */}
      <Eyebrows style={config.eyebrowStyle} browColor={browColor} />

      {/* 8. Nose */}
      <Nose style={config.noseStyle} shade={skinShade} />

      {/* 9. Mouth */}
      <Mouth style={config.mouthStyle} />

      {/* 10. Freckles */}
      {config.freckles && <Freckles />}

      {/* 11. Hair front */}
      <HairFront style={config.hairStyle} color={hairColour} gid={gid} />

      {/* 12. Glasses */}
      <Glasses style={config.glasses} />

      {/* 13. Earrings */}
      <Earrings style={config.earrings} />

      {/* 14. Hat */}
      <Hat style={config.hat} hairColor={hairColour} />
    </Svg>
  );
}
