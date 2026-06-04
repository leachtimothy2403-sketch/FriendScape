import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('children', (t) => {
    t.integer('regeneration_count').notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('children', (t) => {
    t.dropColumn('regeneration_count');
  });
}
