import cron from 'node-cron';
import db from '../db';

export function scheduleGradePromotion(): void {
  // Runs September 1 at 6am Paris time
  // Promotes school_grade_next → school_grade for all children
  // Only updates rows where school_grade_next is not null (kids who used Jules)
  cron.schedule('0 6 1 9 *', async () => {
    try {
      console.log('[grades] 📚 Annual grade promotion starting...');
      const updated = await db('children')
        .whereNotNull('school_grade_next')
        .update({
          school_grade:      db.raw('school_grade_next'),
          school_grade_next: null,
        });
      console.log(`[grades] 📚 Annual grade promotion complete — ${updated} children promoted`);
    } catch (err) {
      console.error('[grades] ❌ Grade promotion failed:', err);
    }
  }, { timezone: 'Europe/Paris' });

  console.log('[grades] 📚 Annual grade promotion job scheduled (Sep 1, Europe/Paris)');
}
