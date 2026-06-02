import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity,
  Modal, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import {
  childBadges, childXP, childGraduation,
  BadgeDefinition, XPData, GraduationProgress,
} from '@/services/api';
import AudioPlayer from '@/components/AudioPlayer';
import { Colors } from '@/constants/theme';

// ── Level data matching the backend ──────────────────────────────────────────
const LEVEL_THRESHOLDS: number[] = [0, 100, 300, 600, 1000, 1500];

function xpProgressFraction(totalXp: number, level: number): number {
  const from = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const to   = LEVEL_THRESHOLDS[level]     ?? from + 1;
  return Math.min(1, Math.max(0, (totalXp - from) / (to - from)));
}

// ── ProgressBar ───────────────────────────────────────────────────────────────

function ProgressBar({ fraction, height = 8, color = Colors.purple }: {
  fraction: number; height?: number; color?: string;
}) {
  return (
    <View style={[s.progressTrack, { height }]}>
      <View style={[s.progressFill, { width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` as `${number}%`, backgroundColor: color }]} />
    </View>
  );
}

// ── Tag ───────────────────────────────────────────────────────────────────────

function Tag({ label, earned }: { label: string; earned: boolean }) {
  return (
    <View style={[s.tag, earned ? s.tagEarned : s.tagLocked]}>
      <Text style={[s.tagText, earned ? s.tagTextEarned : s.tagTextLocked]}>{label}</Text>
    </View>
  );
}

// ── BadgeCard ─────────────────────────────────────────────────────────────────

function BadgeCard({
  badge, onPress, t,
}: { badge: BadgeDefinition; onPress: () => void; t: (k: string, opts?: Record<string, unknown>) => string }) {
  const showProgress = !badge.earned && badge.progress_required !== null && badge.progress_required > 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[s.badgeCard, !badge.earned && s.badgeCardLocked]}
    >
      <Text style={[s.badgeIcon, !badge.earned && { opacity: 0.45 }]}>{badge.icon}</Text>
      <Text style={s.badgeName}>{badge.name}</Text>
      <Text style={s.badgeDesc} numberOfLines={2}>{badge.description}</Text>

      {showProgress && (
        <View style={s.cardProgress}>
          <Text style={s.cardProgressText}>
            {t('badges.progress', {
              current:  Math.min(badge.progress, badge.progress_required as number),
              required: badge.progress_required,
            })}
          </Text>
          <ProgressBar
            fraction={(badge.progress) / (badge.progress_required as number)}
            height={5}
          />
        </View>
      )}

      <Tag label={badge.earned ? t('badges.earned') : t('badges.locked')} earned={badge.earned} />
    </TouchableOpacity>
  );
}

// ── Graduation track ──────────────────────────────────────────────────────────

function GraduationTrack({
  data, t,
}: { data: GraduationProgress | null; t: (k: string, opts?: Record<string, unknown>) => string }) {
  const milestones = data?.milestones ?? [
    { key: 'joined_migo',               label: 'Join Migo',                                   completed: false, completedAt: null },
    { key: 'first_post',                label: 'Share your first post',                        completed: false, completedAt: null },
    { key: 'heart_to_heart',            label: 'Have a heart-to-heart conversation',           completed: false, completedAt: null },
    { key: 'digital_citizenship_lesson',label: 'Complete a digital citizenship lesson',        completed: false, completedAt: null },
    { key: 'introduced_friend',         label: 'Introduce a friend',                           completed: false, completedAt: null },
  ];
  const completed = data?.completed ?? 0;

  return (
    <View style={s.graduationCard}>
      <Text style={s.sectionHeader}>{t('badges.graduationTitle')}</Text>
      <Text style={s.graduationProgress}>
        {t('badges.graduationProgress', { n: completed })}
      </Text>
      <View style={{ marginBottom: 14 }}>
        <ProgressBar fraction={completed / 5} height={8} />
      </View>

      {milestones.map(m => (
        <View key={m.key} style={s.milestoneRow}>
          <Text style={s.milestoneIcon}>{m.completed ? '✅' : '🔒'}</Text>
          <Text style={[s.milestoneLabel, !m.completed && { color: Colors.gray[400] }]}>
            {m.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── EarnedModal ───────────────────────────────────────────────────────────────

function EarnedModal({
  badge, onClose, t, token,
}: {
  badge: BadgeDefinition | null;
  onClose: () => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
  token: string | null;
}) {
  if (!badge) return null;

  const dateStr = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalIcon}>{badge.icon}</Text>
          <Text style={s.modalTitle}>{badge.name}</Text>
          {dateStr ? (
            <Text style={s.modalDate}>{t('badges.earnedOn', { date: dateStr })}</Text>
          ) : null}

          {badge.lumi_message ? (
            <View style={s.lumiBox}>
              <Text style={s.lumiEmoji}>🧚</Text>
              <Text style={s.lumiMessage}>{badge.lumi_message}</Text>
            </View>
          ) : null}

          {badge.lumi_message && token ? (
            <View style={s.audioRow}>
              <AudioPlayer
                text={badge.lumi_message}
                characterId="miga"
                messageId={badge.id}
                size="md"
              />
              <Text style={s.audioHint}>Hear Miga!</Text>
            </View>
          ) : null}

          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={s.closeBtnText}>{t('badges.awesome')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── LockedModal ───────────────────────────────────────────────────────────────

function LockedModal({
  badge, onClose, t,
}: { badge: BadgeDefinition | null; onClose: () => void; t: (k: string, opts?: Record<string, unknown>) => string }) {
  if (!badge) return null;

  const showProgress = badge.progress_required !== null && (badge.progress_required ?? 0) > 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={[s.modalIcon, { opacity: 0.45 }]}>{badge.icon}</Text>
          <Text style={s.modalTitle}>{badge.name}</Text>
          <Text style={s.modalDate}>{t('badges.howToEarn')}</Text>
          <Text style={s.lockedDesc}>{badge.description}</Text>

          {showProgress ? (
            <View style={{ width: '100%', marginTop: 12 }}>
              <Text style={s.cardProgressText}>
                {t('badges.progress', {
                  current:  Math.min(badge.progress, badge.progress_required as number),
                  required: badge.progress_required,
                })}
              </Text>
              <ProgressBar fraction={(badge.progress) / (badge.progress_required as number)} height={8} />
            </View>
          ) : null}

          <TouchableOpacity
            onPress={onClose}
            style={[s.closeBtn, { backgroundColor: Colors.purple + '22' }]}
          >
            <Text style={[s.closeBtnText, { color: Colors.purple }]}>{t('badges.keepGoing')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function BadgesScreen() {
  const { t } = useTranslation();

  const [loading,    setLoading]    = useState(true);
  const [badges,     setBadges]     = useState<BadgeDefinition[]>([]);
  const [xpData,     setXpData]     = useState<XPData | null>(null);
  const [graduation, setGraduation] = useState<GraduationProgress | null>(null);
  const [token,      setToken]      = useState<string | null>(null);
  const [selected,   setSelected]   = useState<BadgeDefinition | null>(null);
  const [modalMode,  setMode]       = useState<'earned' | 'locked'>('earned');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const tok = await AsyncStorage.getItem('childToken');
      if (!tok || cancelled) { if (!cancelled) setLoading(false); return; }
      setToken(tok);

      try {
        const [badgeRes, xpRes, gradRes] = await Promise.all([
          childBadges.list(tok),
          childXP.get(tok),
          childGraduation.get(tok),
        ]);
        if (!cancelled) {
          setBadges(badgeRes.data.badges);
          setXpData(xpRes.data);
          setGraduation(gradRes.data);
        }
      } catch (e) {
        console.error('[badges] load failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const openBadge = useCallback((badge: BadgeDefinition) => {
    setSelected(badge);
    setMode(badge.earned ? 'earned' : 'locked');
  }, []);

  const closeModal = useCallback(() => setSelected(null), []);

  const earnedBadges = badges.filter(b => b.earned);
  const lockedBadges = badges.filter(b => !b.earned);

  const xpFraction = xpData ? xpProgressFraction(xpData.total_xp, xpData.level) : 0;

  if (loading) {
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.topBar}>
          <View style={s.logoRow}><Text style={s.logoMi}>Mi</Text><Text style={s.logoGo}>go</Text></View>
          <Text style={s.topTitle}>{t('badges.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.purple} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      {/* Top bar */}
      <View style={s.topBar}>
        <View style={s.logoRow}><Text style={s.logoMi}>Mi</Text><Text style={s.logoGo}>go</Text></View>
        <Text style={s.topTitle}>{t('badges.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* XP card */}
        {xpData ? (
          <View style={s.xpCard}>
            <View style={s.xpRow}>
              <Text style={s.xpLevel}>⭐ Level {xpData.level} — {xpData.level_name}</Text>
              <Text style={s.xpNumbers}>
                {xpData.total_xp} / {xpData.next_level_threshold ?? '∞'} XP
              </Text>
            </View>
            <View style={{ marginVertical: 10 }}>
              <ProgressBar fraction={xpFraction} height={10} />
            </View>
            {xpData.next_level_threshold !== null ? (
              <Text style={s.xpSubtitle}>
                {t('badges.xpToNext', { xp: xpData.xp_to_next_level, next: xpData.level + 1 })}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Earned badges */}
        {earnedBadges.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionHeader}>
              {t('badges.yourBadges')} ({earnedBadges.length})
            </Text>
            <View style={s.grid}>
              {earnedBadges.map(b => (
                <BadgeCard key={b.id} badge={b} onPress={() => openBadge(b)} t={t} />
              ))}
            </View>
          </View>
        ) : null}

        {/* Locked badges */}
        {lockedBadges.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionHeader}>{t('badges.comingUp')}</Text>
            <View style={s.grid}>
              {lockedBadges.map(b => (
                <BadgeCard key={b.id} badge={b} onPress={() => openBadge(b)} t={t} />
              ))}
            </View>
          </View>
        ) : null}

        {/* Graduation track */}
        <GraduationTrack data={graduation} t={t} />

      </ScrollView>

      {/* Modals */}
      {modalMode === 'earned' ? (
        <EarnedModal badge={selected} onClose={closeModal} t={t} token={token} />
      ) : (
        <LockedModal badge={selected} onClose={closeModal} t={t} />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0EFF8',
  },
  logoRow:  { flexDirection: 'row' },
  logoMi:   { fontSize: 20, fontWeight: '700', color: '#2C2C2A' },
  logoGo:   { fontSize: 20, fontWeight: '700', color: Colors.purple },
  topTitle: { fontSize: 15, fontWeight: '700', color: '#2C2C2A' },

  scroll: { padding: 14, paddingBottom: 40 },

  xpCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 18, marginBottom: 20,
    shadowColor: Colors.purple, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  xpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  xpLevel: { fontSize: 14, fontWeight: '700', color: '#2C2C2A', flex: 1 },
  xpNumbers: { fontSize: 12, color: Colors.purple, fontWeight: '600' },
  xpSubtitle: { fontSize: 11, color: Colors.gray[500], marginTop: 2 },

  progressTrack: {
    backgroundColor: Colors.gray[200], borderRadius: 99, overflow: 'hidden',
    width: '100%',
  },
  progressFill: { borderRadius: 99, height: '100%' },

  section: { marginBottom: 20 },
  sectionHeader: { fontSize: 15, fontWeight: '800', color: '#2C2C2A', marginBottom: 12 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  badgeCard: {
    width: '47.5%', backgroundColor: '#fff',
    borderRadius: 16, padding: 14,
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  badgeCardLocked: { opacity: 0.7 },
  badgeIcon: { fontSize: 36, marginBottom: 6 },
  badgeName: { fontSize: 13, fontWeight: '700', color: '#2C2C2A', marginBottom: 3 },
  badgeDesc: { fontSize: 11, color: Colors.gray[500], lineHeight: 15, marginBottom: 8 },

  cardProgress: { marginBottom: 8 },
  cardProgressText: { fontSize: 10, color: Colors.gray[500], marginBottom: 4 },

  tag: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  tagEarned: { backgroundColor: Colors.green + '22' },
  tagLocked: { backgroundColor: Colors.gray[200] },
  tagText: { fontSize: 10, fontWeight: '700' },
  tagTextEarned: { color: Colors.green },
  tagTextLocked: { color: Colors.gray[500] },

  graduationCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 18, marginBottom: 8,
    shadowColor: Colors.purple, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  graduationProgress: { fontSize: 12, color: Colors.gray[500], marginBottom: 8 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  milestoneIcon: { fontSize: 18, marginRight: 10, width: 26 },
  milestoneLabel: { fontSize: 14, color: '#2C2C2A', flex: 1 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%',
    alignItems: 'center',
  },
  modalIcon: { fontSize: 60, marginBottom: 12 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#2C2C2A', textAlign: 'center', marginBottom: 6 },
  modalDate: { fontSize: 13, color: Colors.gray[500], marginBottom: 16 },

  lumiBox: {
    backgroundColor: Colors.purple + '11', borderRadius: 16,
    padding: 14, flexDirection: 'row', gap: 10, marginBottom: 16, width: '100%',
  },
  lumiEmoji: { fontSize: 22, marginTop: 1 },
  lumiMessage: { flex: 1, fontSize: 13, color: '#2C2C2A', lineHeight: 20 },

  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  audioHint: { fontSize: 12, color: Colors.purple, fontWeight: '600' },

  lockedDesc: {
    fontSize: 14, color: '#2C2C2A', textAlign: 'center', lineHeight: 21, marginBottom: 6,
  },

  closeBtn: {
    marginTop: 16, backgroundColor: Colors.purple, borderRadius: 99,
    paddingHorizontal: 32, paddingVertical: 14, width: '100%', alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
