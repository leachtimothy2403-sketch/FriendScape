import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Animated, Switch, StyleSheet, Dimensions, ActivityIndicator,
} from 'react-native';
import Svg, { Circle, Ellipse, Rect, Path, Line, G } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import Avatar from './Avatar';
import {
  SKIN_TONES, HAIR_COLOURS, EYE_COLOURS, BACKGROUND_COLOURS,
} from '@/types/avatar';
import type { AvatarConfig } from '@/types/avatar';

// ── Types ──────────────────────────────────────────────────────────────────────

type TabId = 'face' | 'hair' | 'eyes' | 'mouth' | 'extras';

type TabProps = {
  config:   AvatarConfig;
  onChange: (key: keyof AvatarConfig, val: AvatarConfig[keyof AvatarConfig]) => void;
  tb:       (k: string) => string;
};

export interface AvatarBuilderCoreProps {
  initialConfig:     AvatarConfig;
  initialBackground: string;
  saveLabel:         string;
  isSaving?:         boolean;
  onSave:            (config: AvatarConfig, background: string) => void;
}

// ── Layout ─────────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const INNER_W  = SCREEN_W - 32;
const card5    = Math.floor((INNER_W - 32) / 5);
const card4    = Math.floor((INNER_W - 24) / 4);
const card3    = Math.floor((INNER_W - 16) / 3);

// ── Option lists ───────────────────────────────────────────────────────────────

const TABS: { id: TabId; k: string }[] = [
  { id: 'face',   k: 'faceTab'   },
  { id: 'hair',   k: 'hairTab'   },
  { id: 'eyes',   k: 'eyesTab'   },
  { id: 'mouth',  k: 'mouthTab'  },
  { id: 'extras', k: 'extrasTab' },
];

const FACE_SHAPES:  AvatarConfig['faceShape'][]    = ['oval','round','square','heart','diamond'];
const HAIR_STYLES:  AvatarConfig['hairStyle'][]    = ['short','medium','long','curly','braids','ponytail','bun','afro','shaved'];
const EYE_SHAPES:   AvatarConfig['eyeShape'][]     = ['almond','round','wide','hooded','upturned'];
const BROW_STYLES:  AvatarConfig['eyebrowStyle'][] = ['thin','normal','thick','arched'];
const MOUTH_STYLES: AvatarConfig['mouthStyle'][]   = ['bigsmile','smile','neutral','cheeky'];
const NOSE_STYLES:  AvatarConfig['noseStyle'][]    = ['soft','button','broad','narrow','upturned'];
const GLASSES:      AvatarConfig['glasses'][]      = ['none','round','square','heart','sporty'];
const HATS:         AvatarConfig['hat'][]          = ['none','cap','beanie','crown','flowerclip'];
const EARRINGS:     AvatarConfig['earrings'][]     = ['none','studs','hoops','stars'];

// ── SVG Thumbs ─────────────────────────────────────────────────────────────────

function FaceShapeThumb({ shape }: { shape: AvatarConfig['faceShape'] }) {
  const fill = '#F5C5A3'; const stroke = '#D4A878'; const sw = 1.5;
  return (
    <Svg width={36} height={40} viewBox="0 0 40 44">
      {shape === 'oval'    && <Ellipse cx={20} cy={22} rx={14} ry={18} fill={fill} stroke={stroke} strokeWidth={sw} />}
      {shape === 'round'   && <Circle  cx={20} cy={22} r={17}          fill={fill} stroke={stroke} strokeWidth={sw} />}
      {shape === 'square'  && <Rect x={4} y={2} width={32} height={38} rx={8} fill={fill} stroke={stroke} strokeWidth={sw} />}
      {shape === 'heart'   && <Path d="M20,8 C14,2 2,6 2,16 C2,28 14,36 20,42 C26,36 38,28 38,16 C38,6 26,2 20,8 Z" fill={fill} stroke={stroke} strokeWidth={sw} />}
      {shape === 'diamond' && <Path d="M20,2 L38,22 L20,42 L2,22 Z" fill={fill} stroke={stroke} strokeWidth={sw} />}
    </Svg>
  );
}

function EyeShapeThumb({ shape }: { shape: AvatarConfig['eyeShape'] }) {
  const iris = '#4A90D9';
  return (
    <Svg width={44} height={22} viewBox="0 0 44 24">
      {shape === 'almond'   && <Ellipse cx={22} cy={12} rx={16} ry={8}  fill="white" stroke="#ccc" strokeWidth={1} />}
      {shape === 'round'    && <Ellipse cx={22} cy={12} rx={11} ry={11} fill="white" stroke="#ccc" strokeWidth={1} />}
      {shape === 'wide'     && <Ellipse cx={22} cy={12} rx={18} ry={9}  fill="white" stroke="#ccc" strokeWidth={1} />}
      {shape === 'hooded'   && (
        <G>
          <Ellipse cx={22} cy={13} rx={16} ry={8} fill="white" stroke="#ccc" strokeWidth={1} />
          <Path d="M6,9 Q22,3 38,9" fill="#F5C5A3" opacity={0.6} />
        </G>
      )}
      {shape === 'upturned' && <Ellipse cx={22} cy={12} rx={16} ry={8} fill="white" stroke="#ccc" strokeWidth={1} transform="rotate(-8,22,12)" />}
      <Circle cx={22} cy={12} r={6} fill={iris} />
      <Circle cx={22} cy={12} r={3} fill="#111" />
      <Circle cx={24} cy={10} r={2} fill="white" />
    </Svg>
  );
}

function BrowThumb({ style }: { style: AvatarConfig['eyebrowStyle'] }) {
  const p = { stroke: '#6B3A2A', strokeLinecap: 'round' as const, fill: 'none' };
  return (
    <Svg width={44} height={18} viewBox="0 0 44 20">
      {style === 'thin'   && <G><Path d="M2,14 Q11,10 20,14"  {...p} strokeWidth={1.5} /><Path d="M24,14 Q33,10 42,14" {...p} strokeWidth={1.5} /></G>}
      {style === 'normal' && <G><Path d="M2,13 Q11,8 20,13"   {...p} strokeWidth={2.5} /><Path d="M24,13 Q33,8 42,13"  {...p} strokeWidth={2.5} /></G>}
      {style === 'thick'  && <G><Path d="M2,13 Q11,7 20,13"   {...p} strokeWidth={4}   /><Path d="M24,13 Q33,7 42,13"  {...p} strokeWidth={4}   /></G>}
      {style === 'arched' && <G><Path d="M2,14 Q11,4 20,10"   {...p} strokeWidth={2.5} /><Path d="M24,10 Q33,4 42,14"  {...p} strokeWidth={2.5} /></G>}
    </Svg>
  );
}

function MouthThumb({ style }: { style: AvatarConfig['mouthStyle'] }) {
  const p = { stroke: '#D45B5B', strokeLinecap: 'round' as const, fill: 'none', strokeWidth: 2.5 };
  return (
    <Svg width={44} height={22} viewBox="0 0 44 24">
      {style === 'bigsmile' && <Path d="M8,8 Q22,22 36,8"   {...p} />}
      {style === 'smile'    && <Path d="M10,10 Q22,18 34,10" {...p} />}
      {style === 'neutral'  && <Line x1={12} y1={12} x2={32} y2={12} stroke="#D45B5B" strokeWidth={2.5} strokeLinecap="round" />}
      {style === 'cheeky'   && <Path d="M10,10 Q20,16 34,8"  {...p} />}
    </Svg>
  );
}

function NoseThumb({ style }: { style: AvatarConfig['noseStyle'] }) {
  const p = { stroke: '#C48A68', fill: 'none', strokeLinecap: 'round' as const, strokeWidth: 2 };
  return (
    <Svg width={36} height={28} viewBox="0 0 40 28">
      {style === 'soft'     && <Path d="M16,4 C14,10 14,20 20,22 C26,20 26,10 24,4"   {...p} />}
      {style === 'button'   && <Circle cx={20} cy={14} r={5} fill="#C48A68" opacity={0.5} />}
      {style === 'broad'    && <Path d="M10,8 C8,14 10,24 20,24 C30,24 32,14 30,8"    {...p} />}
      {style === 'narrow'   && <Path d="M17,4 C15,10 17,22 20,22 C23,22 25,10 23,4"   {...p} />}
      {style === 'upturned' && <Path d="M14,18 C13,10 20,6 20,6 C20,6 27,10 26,18"    {...p} />}
    </Svg>
  );
}

function GlassesThumb({ style }: { style: AvatarConfig['glasses'] }) {
  const fc = '#333'; const sw = 1.5;
  if (style === 'none') {
    return (
      <Svg width={50} height={22} viewBox="0 0 50 24">
        <Line x1={8} y1={12} x2={42} y2={12} stroke="#DDD" strokeWidth={2} strokeDasharray="4,3" strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={50} height={22} viewBox="0 0 50 26">
      {style === 'round' && (
        <G>
          <Circle cx={14} cy={13} r={9}  stroke={fc} strokeWidth={sw} fill="none" />
          <Circle cx={36} cy={13} r={9}  stroke={fc} strokeWidth={sw} fill="none" />
          <Line x1={23} y1={13} x2={27} y2={13} stroke={fc} strokeWidth={sw} />
          <Line x1={1}  y1={13} x2={5}  y2={13} stroke={fc} strokeWidth={1} />
          <Line x1={45} y1={13} x2={49} y2={13} stroke={fc} strokeWidth={1} />
        </G>
      )}
      {style === 'square' && (
        <G>
          <Rect x={5}  y={7} width={18} height={12} rx={2} stroke={fc} strokeWidth={sw} fill="none" />
          <Rect x={27} y={7} width={18} height={12} rx={2} stroke={fc} strokeWidth={sw} fill="none" />
          <Line x1={23} y1={13} x2={27} y2={13} stroke={fc} strokeWidth={sw} />
          <Line x1={1}  y1={13} x2={5}  y2={13} stroke={fc} strokeWidth={1} />
          <Line x1={45} y1={13} x2={49} y2={13} stroke={fc} strokeWidth={1} />
        </G>
      )}
      {style === 'heart' && (
        <G>
          <Path d="M14,8 C14,5 10,5 10,8 C10,13 14,17 14,17 C14,17 18,13 18,8 C18,5 14,5 14,8 Z" stroke="#FF69B4" strokeWidth={sw} fill="none" />
          <Path d="M36,8 C36,5 32,5 32,8 C32,13 36,17 36,17 C36,17 40,13 40,8 C40,5 36,5 36,8 Z" stroke="#FF69B4" strokeWidth={sw} fill="none" />
          <Line x1={18} y1={12} x2={32} y2={12} stroke="#FF69B4" strokeWidth={sw} />
        </G>
      )}
      {style === 'sporty' && (
        <Path d="M4,10 Q12,4 25,4 Q38,4 46,10 L44,17 Q38,23 25,23 Q12,23 6,17 Z" stroke={fc} strokeWidth={sw} fill="none" opacity={0.8} />
      )}
    </Svg>
  );
}

function HatThumb({ style }: { style: AvatarConfig['hat'] }) {
  if (style === 'none') {
    return (
      <Svg width={50} height={32} viewBox="0 0 50 34">
        <Line x1={8} y1={24} x2={42} y2={24} stroke="#DDD" strokeWidth={2} strokeDasharray="4,3" strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={50} height={32} viewBox="0 0 50 34">
      {style === 'cap' && (
        <G>
          <Path d="M5,22 C5,8 45,8 45,22 L40,16 Q25,11 10,16 Z" fill="#9B59B6" />
          <Path d="M2,20 Q0,24 2,26 Q8,28 14,26 L18,22 Q8,21 2,20 Z" fill="#8E44AD" />
          <Line x1={5} y1={21} x2={45} y2={21} stroke="#7D3C98" strokeWidth={2} />
        </G>
      )}
      {style === 'beanie' && (
        <G>
          <Path d="M5,26 C5,6 45,6 45,26 L40,18 Q25,11 10,18 Z" fill="#3498DB" />
          <Rect x={5} y={22} width={40} height={9} rx={4} fill="#2980B9" />
          <Circle cx={25} cy={6} r={4} fill="#3498DB" />
        </G>
      )}
      {style === 'crown' && (
        <G>
          <Path d="M10,24 L16,10 L25,18 L34,10 L40,24 Z" fill="#FFD700" stroke="#E8B800" strokeWidth={1} />
          <Rect x={10} y={22} width={30} height={7} rx={2} fill="#F0C800" />
          <Circle cx={16} cy={10} r={3} fill="#FF6B6B" />
          <Circle cx={25} cy={15} r={3} fill="#4ECDC4" />
          <Circle cx={34} cy={10} r={3} fill="#FF6B6B" />
        </G>
      )}
      {style === 'flowerclip' && (
        <G>
          <Circle cx={14} cy={14} r={5} fill="#FFB6C1" />
          <Circle cx={22} cy={10} r={5} fill="#FFB6C1" />
          <Circle cx={22} cy={18} r={5} fill="#FFB6C1" />
          <Circle cx={6}  cy={10} r={5} fill="#FFB6C1" />
          <Circle cx={6}  cy={18} r={5} fill="#FFB6C1" />
          <Circle cx={14} cy={14} r={6} fill="#FFCDD2" />
          <Circle cx={14} cy={14} r={3} fill="#FF8A80" />
        </G>
      )}
    </Svg>
  );
}

function EarringsThumb({ style }: { style: AvatarConfig['earrings'] }) {
  const gold = '#FFD700';
  if (style === 'none') {
    return (
      <Svg width={34} height={24} viewBox="0 0 34 26">
        <Line x1={6} y1={13} x2={28} y2={13} stroke="#DDD" strokeWidth={2} strokeDasharray="3,2" strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={34} height={24} viewBox="0 0 34 26">
      {style === 'studs' && (
        <G>
          <Circle cx={8}  cy={13} r={4} fill={gold} />
          <Circle cx={26} cy={13} r={4} fill={gold} />
        </G>
      )}
      {style === 'hoops' && (
        <G>
          <Circle cx={8}  cy={13} r={7} stroke={gold} strokeWidth={2.5} fill="none" />
          <Circle cx={26} cy={13} r={7} stroke={gold} strokeWidth={2.5} fill="none" />
        </G>
      )}
      {style === 'stars' && (
        <G>
          <Path d="M8,4 L9.5,9 L14,9 L10.5,11.5 L12,16 L8,13.5 L4,16 L5.5,11.5 L2,9 L6.5,9 Z" fill={gold} />
          <Path d="M26,4 L27.5,9 L32,9 L28.5,11.5 L30,16 L26,13.5 L22,16 L23.5,11.5 L20,9 L24.5,9 Z" fill={gold} />
        </G>
      )}
    </Svg>
  );
}

// ── Shared primitives ──────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return <Text style={s.sectionLabel}>{text}</Text>;
}

function ColourRow({ colours, selected, onSelect }: {
  colours: string[]; selected: string; onSelect: (c: string) => void;
}) {
  return (
    <View style={s.colourRow}>
      {colours.map(c => (
        <TouchableOpacity
          key={c}
          onPress={() => onSelect(c)}
          activeOpacity={0.8}
          style={[s.colourDot, { backgroundColor: c }, selected === c && s.colourDotSelected]}
        />
      ))}
    </View>
  );
}

function OptionCard({ selected, onPress, label, children, cardStyle }: {
  selected: boolean; onPress: () => void; label: string;
  children: React.ReactNode; cardStyle?: object;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[s.optCard, selected && s.optCardSelected, cardStyle]}
    >
      {children}
      <Text style={[s.optLabel, selected && s.optLabelSelected]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Tab content ────────────────────────────────────────────────────────────────

function FaceTab({ config, onChange, tb }: TabProps) {
  return (
    <View>
      <SectionLabel text={tb('faceShape')} />
      <View style={s.optRow}>
        {FACE_SHAPES.map(shape => (
          <OptionCard
            key={shape}
            selected={config.faceShape === shape}
            onPress={() => onChange('faceShape', shape)}
            label={tb(shape)}
            cardStyle={{ width: card5 }}
          >
            <FaceShapeThumb shape={shape} />
          </OptionCard>
        ))}
      </View>
      <SectionLabel text={tb('skinTone')} />
      <ColourRow colours={SKIN_TONES} selected={config.skinTone} onSelect={c => onChange('skinTone', c)} />
    </View>
  );
}

function HairTab({ config, onChange, tb }: TabProps) {
  return (
    <View>
      <SectionLabel text={tb('hairStyle')} />
      <View style={s.optRow}>
        {HAIR_STYLES.map(style => (
          <OptionCard
            key={style}
            selected={config.hairStyle === style}
            onPress={() => onChange('hairStyle', style)}
            label={tb(style)}
            cardStyle={{ width: card3 }}
          >
            <Avatar config={{ ...config, hairStyle: style }} background="#EEEDFE" size={64} />
          </OptionCard>
        ))}
      </View>
      <SectionLabel text={tb('hairColour')} />
      <ColourRow colours={HAIR_COLOURS} selected={config.hairColour} onSelect={c => onChange('hairColour', c)} />
    </View>
  );
}

function EyesTab({ config, onChange, tb }: TabProps) {
  return (
    <View>
      <SectionLabel text={tb('eyeShape')} />
      <View style={s.optRow}>
        {EYE_SHAPES.map(shape => (
          <OptionCard
            key={shape}
            selected={config.eyeShape === shape}
            onPress={() => onChange('eyeShape', shape)}
            label={tb(shape)}
            cardStyle={{ width: card5 }}
          >
            <EyeShapeThumb shape={shape} />
          </OptionCard>
        ))}
      </View>
      <SectionLabel text={tb('eyeColour')} />
      <ColourRow colours={EYE_COLOURS} selected={config.eyeColour} onSelect={c => onChange('eyeColour', c)} />
      <SectionLabel text={tb('eyebrows')} />
      <View style={s.optRow}>
        {BROW_STYLES.map(style => (
          <OptionCard
            key={style}
            selected={config.eyebrowStyle === style}
            onPress={() => onChange('eyebrowStyle', style)}
            label={tb(style)}
            cardStyle={{ width: card4 }}
          >
            <BrowThumb style={style} />
          </OptionCard>
        ))}
      </View>
    </View>
  );
}

function MouthTab({ config, onChange, tb }: TabProps) {
  return (
    <View>
      <SectionLabel text={tb('mouthStyle')} />
      <View style={s.optRow}>
        {MOUTH_STYLES.map(style => (
          <OptionCard
            key={style}
            selected={config.mouthStyle === style}
            onPress={() => onChange('mouthStyle', style)}
            label={tb(style)}
            cardStyle={{ width: card4 }}
          >
            <MouthThumb style={style} />
          </OptionCard>
        ))}
      </View>
      <SectionLabel text={tb('noseStyle')} />
      <View style={s.optRow}>
        {NOSE_STYLES.map(style => (
          <OptionCard
            key={style}
            selected={config.noseStyle === style}
            onPress={() => onChange('noseStyle', style)}
            label={tb(style)}
            cardStyle={{ width: card5 }}
          >
            <NoseThumb style={style} />
          </OptionCard>
        ))}
      </View>
    </View>
  );
}

function glassesLabel(style: AvatarConfig['glasses'], tb: (k: string) => string): string {
  if (style === 'none')   return tb('none');
  if (style === 'round')  return tb('roundGlasses');
  if (style === 'square') return tb('squareGlasses');
  if (style === 'heart')  return tb('heartGlasses');
  return tb(style);
}

function ExtrasTab({ config, onChange, tb }: TabProps) {
  return (
    <View>
      <SectionLabel text={tb('glasses')} />
      <View style={s.optRow}>
        {GLASSES.map(style => (
          <OptionCard
            key={style}
            selected={config.glasses === style}
            onPress={() => onChange('glasses', style)}
            label={glassesLabel(style, tb)}
            cardStyle={{ width: card5 }}
          >
            <GlassesThumb style={style} />
          </OptionCard>
        ))}
      </View>
      <SectionLabel text={tb('hat')} />
      <View style={s.optRow}>
        {HATS.map(style => (
          <OptionCard
            key={style}
            selected={config.hat === style}
            onPress={() => onChange('hat', style)}
            label={style === 'none' ? tb('none') : tb(style)}
            cardStyle={{ width: card5 }}
          >
            <HatThumb style={style} />
          </OptionCard>
        ))}
      </View>
      <SectionLabel text={tb('earrings')} />
      <View style={s.optRow}>
        {EARRINGS.map(style => (
          <OptionCard
            key={style}
            selected={config.earrings === style}
            onPress={() => onChange('earrings', style)}
            label={style === 'none' ? tb('none') : tb(style)}
            cardStyle={{ width: card4 }}
          >
            <EarringsThumb style={style} />
          </OptionCard>
        ))}
      </View>
      <SectionLabel text={tb('freckles')} />
      <View style={s.frecklesRow}>
        <Text style={s.frecklesLabel}>{tb('freckles')}</Text>
        <Switch
          value={config.freckles}
          onValueChange={v => onChange('freckles', v)}
          trackColor={{ false: '#E8E6FF', true: '#7F77DD' }}
          thumbColor={config.freckles ? '#fff' : '#BDBDBD'}
        />
      </View>
    </View>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function AvatarBuilderCore({
  initialConfig,
  initialBackground,
  saveLabel,
  isSaving = false,
  onSave,
}: AvatarBuilderCoreProps) {
  const { t }                        = useTranslation();
  const tb                           = useCallback((k: string) => t(`onboarding.avatarBuilder.${k}`), [t]);
  const [config, setConfig]          = useState<AvatarConfig>(initialConfig);
  const [background, setBackground]  = useState(initialBackground);
  const [activeTab, setActiveTab]    = useState<TabId>('face');
  const bounceAnim                   = useRef(new Animated.Value(1)).current;

  const triggerBounce = useCallback(() => {
    Animated.sequence([
      Animated.timing(bounceAnim, { toValue: 1.05, duration: 100, useNativeDriver: true }),
      Animated.timing(bounceAnim, { toValue: 1.0,  duration: 100, useNativeDriver: true }),
    ]).start();
  }, [bounceAnim]);

  const onChange = useCallback((key: keyof AvatarConfig, val: AvatarConfig[keyof AvatarConfig]) => {
    setConfig(prev => ({ ...prev, [key]: val } as AvatarConfig));
    triggerBounce();
  }, [triggerBounce]);

  const updateBg = useCallback((c: string) => {
    setBackground(c);
    triggerBounce();
  }, [triggerBounce]);

  return (
    <View style={s.root}>

      {/* Preview */}
      <View style={s.previewArea}>
        <Animated.View style={{ transform: [{ scale: bounceAnim }] }}>
          <Avatar config={config} background={background} size={180} />
        </Animated.View>
        <View style={s.swatchRow}>
          {BACKGROUND_COLOURS.map(c => (
            <TouchableOpacity
              key={c}
              onPress={() => updateBg(c)}
              activeOpacity={0.8}
              style={[s.swatch, { backgroundColor: c }, background === c && s.swatchSelected]}
            />
          ))}
        </View>
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabsBar}
        contentContainerStyle={s.tabsContent}
      >
        {TABS.map(tab => (
          <TouchableOpacity key={tab.id} onPress={() => setActiveTab(tab.id)} style={s.tab}>
            <Text style={[s.tabLabel, activeTab === tab.id && s.tabLabelActive]}>{tb(tab.k)}</Text>
            {activeTab === tab.id && <View style={s.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Options scroll */}
      <ScrollView
        style={s.optionsScroll}
        contentContainerStyle={s.optionsPad}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'face'   && <FaceTab   config={config} onChange={onChange} tb={tb} />}
        {activeTab === 'hair'   && <HairTab   config={config} onChange={onChange} tb={tb} />}
        {activeTab === 'eyes'   && <EyesTab   config={config} onChange={onChange} tb={tb} />}
        {activeTab === 'mouth'  && <MouthTab  config={config} onChange={onChange} tb={tb} />}
        {activeTab === 'extras' && <ExtrasTab config={config} onChange={onChange} tb={tb} />}
      </ScrollView>

      {/* Save button */}
      <View style={s.saveArea}>
        <TouchableOpacity
          onPress={() => onSave(config, background)}
          disabled={isSaving}
          activeOpacity={0.85}
          style={[s.saveBtn, isSaving && s.saveBtnDisabled]}
        >
          {isSaving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.saveBtnText}>{saveLabel}</Text>}
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  previewArea: {
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EFF8',
  },
  swatchRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchSelected: {
    borderWidth: 3, borderColor: '#7F77DD',
    shadowColor: '#7F77DD', shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
  },

  tabsBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0EFF8',
    maxHeight: 44,
    flexGrow: 0,
    flexShrink: 0,
  },
  tabsContent: { paddingHorizontal: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 11, position: 'relative', alignItems: 'center' },
  tabLabel: { fontSize: 13, fontWeight: '600', color: '#9995A4' },
  tabLabelActive: { color: '#7F77DD' },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: 8, right: 8,
    height: 2.5, backgroundColor: '#7F77DD', borderRadius: 2,
  },

  optionsScroll: { flex: 1, backgroundColor: '#F8F7FF' },
  optionsPad:   { padding: 16, paddingBottom: 24 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9995A4',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10, marginTop: 8,
  },

  colourRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  colourDot:        { width: 32, height: 32, borderRadius: 16 },
  colourDotSelected: {
    borderWidth: 3, borderColor: '#7F77DD',
    shadowColor: '#7F77DD', shadowOpacity: 0.5, shadowRadius: 3, elevation: 3,
  },

  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  optCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 8,
    borderWidth: 1.5, borderColor: '#E8E6FF', alignItems: 'center',
  },
  optCardSelected: { borderWidth: 2, borderColor: '#7F77DD', backgroundColor: '#F0EFFE' },
  optLabel:        { fontSize: 10, color: '#9995A4', marginTop: 4, textAlign: 'center' },
  optLabelSelected:{ color: '#7F77DD', fontWeight: '600' },

  frecklesRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: '#E8E6FF', marginBottom: 16,
  },
  frecklesLabel: { fontSize: 14, fontWeight: '600', color: '#2C2C2A' },

  saveArea: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#F8F7FF',
    borderTopWidth: 1, borderTopColor: '#F0EFF8',
  },
  saveBtn: {
    backgroundColor: '#7F77DD', borderRadius: 9999,
    paddingVertical: 16, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
});
