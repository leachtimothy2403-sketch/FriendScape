import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('enrollments', (t) => {
    t.string('consent_ip').nullable().defaultTo(null);
    t.text('consent_user_agent').nullable().defaultTo(null);
    t.string('consent_terms_version').nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('enrollments', (t) => {
    t.dropColumn('consent_ip');
    t.dropColumn('consent_user_agent');
    t.dropColumn('consent_terms_version');
  });
}
