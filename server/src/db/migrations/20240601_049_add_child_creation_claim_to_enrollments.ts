import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('enrollments', (t) => {
    t.boolean('child_creation_claimed').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('enrollments', (t) => {
    t.dropColumn('child_creation_claimed');
  });
}
