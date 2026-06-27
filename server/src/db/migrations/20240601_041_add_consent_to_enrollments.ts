import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('enrollments', (t) => {
    t.timestamp('consent_accepted_at').nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('enrollments', (t) => {
    t.dropColumn('consent_accepted_at');
  });
}
