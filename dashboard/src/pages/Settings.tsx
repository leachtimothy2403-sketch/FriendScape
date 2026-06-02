import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { parent as parentApi } from '../services/api';

interface Settings {
  alertsEnabled: boolean;
  weeklyReportEnabled: boolean;
  contentFilterLevel: 'strict' | 'moderate' | 'relaxed';
  screenTimeLimitMinutes: number;
  bedtimeLockEnabled: boolean;
  bedtimeLockStart: string;
  bedtimeLockEnd: string;
}

const FILTER_OPTIONS = [
  { value: 'strict', label: 'Strict', description: 'Most conservative — best for younger children' },
  { value: 'moderate', label: 'Moderate', description: 'Balanced for most 7–10 year olds' },
  { value: 'relaxed', label: 'Relaxed', description: 'More freedom for older, trusted children' },
];

export default function Settings() {
  const [settings, setSettings] = useState<Settings>({
    alertsEnabled: true,
    weeklyReportEnabled: true,
    contentFilterLevel: 'strict',
    screenTimeLimitMinutes: 60,
    bedtimeLockEnabled: false,
    bedtimeLockStart: '20:00',
    bedtimeLockEnd: '07:00',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await parentApi.updateSettings(settings as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <Link to="/dashboard" className="text-purple text-sm font-medium hover:underline">← Dashboard</Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Settings</h1>
        <p className="text-sm text-gray-400 mb-8">Control how Migo works for your family.</p>

        <form onSubmit={handleSave} className="space-y-6">
          <Section title="Notifications">
            <Toggle
              label="Alerts & notifications"
              description="Get notified about mood flags, milestones, and anything that needs your attention."
              value={settings.alertsEnabled}
              onChange={(v) => update('alertsEnabled', v)}
            />
            <Toggle
              label="Weekly activity report"
              description="Receive a weekly email summary of your child's activity and growth."
              value={settings.weeklyReportEnabled}
              onChange={(v) => update('weeklyReportEnabled', v)}
            />
          </Section>

          <Section title="Content & Safety">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Content filter level</p>
              <div className="space-y-2">
                {FILTER_OPTIONS.map((opt) => (
                  <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${settings.contentFilterLevel === opt.value ? 'border-purple bg-purple/5' : 'border-gray-200 bg-white'}`}>
                    <input
                      type="radio"
                      name="filter"
                      value={opt.value}
                      checked={settings.contentFilterLevel === opt.value}
                      onChange={() => update('contentFilterLevel', opt.value as Settings['contentFilterLevel'])}
                      className="mt-0.5 accent-purple"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
                      <p className="text-xs text-gray-400">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Screen Time">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Daily screen time limit: <span className="text-purple font-bold">{settings.screenTimeLimitMinutes} min</span>
              </label>
              <input
                type="range"
                min={15}
                max={240}
                step={15}
                value={settings.screenTimeLimitMinutes}
                onChange={(e) => update('screenTimeLimitMinutes', Number(e.target.value))}
                className="w-full accent-purple"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>15 min</span><span>4 hours</span>
              </div>
            </div>
            <Toggle
              label="Bedtime lock"
              description="Automatically lock Migo during sleep hours."
              value={settings.bedtimeLockEnabled}
              onChange={(v) => update('bedtimeLockEnabled', v)}
            />
            {settings.bedtimeLockEnabled && (
              <div className="flex gap-4 mt-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 block mb-1">Locks at</label>
                  <input type="time" value={settings.bedtimeLockStart} onChange={(e) => update('bedtimeLockStart', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 block mb-1">Unlocks at</label>
                  <input type="time" value={settings.bedtimeLockEnd} onChange={(e) => update('bedtimeLockEnd', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            )}
          </Section>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-purple text-white font-bold py-3 rounded-xl hover:bg-purple/90 transition disabled:opacity-50"
          >
            {saved ? '✓ Settings saved!' : saving ? 'Saving…' : 'Save Settings'}
          </button>
        </form>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <h2 className="text-base font-bold text-gray-800 mb-5">{title}</h2>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function Toggle({ label, description, value, onChange }: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${value ? 'bg-purple' : 'bg-gray-200'}`}
      >
        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}
