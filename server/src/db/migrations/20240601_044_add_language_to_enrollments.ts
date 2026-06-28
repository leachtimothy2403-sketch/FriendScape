import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('enrollments', (t) => {
    t.string('language', 5).defaultTo('en').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('enrollments', (t) => {
    t.dropColumn('language');
  });
}
