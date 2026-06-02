import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 255).unique().notNullable();
    t.string('display_name', 100).notNullable();
    t.string('password_hash', 255).notNullable();
    t.boolean('email_verified').defaultTo(false);
    t.jsonb('settings').defaultTo(JSON.stringify({
      alertsEnabled: true,
      weeklyReportEnabled: true,
      contentFilterLevel: 'strict',
      screenTimeLimitMinutes: 60,
      bedtimeLockEnabled: false,
      bedtimeLockStart: '20:00',
      bedtimeLockEnd: '07:00',
    }));
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('users');
}
