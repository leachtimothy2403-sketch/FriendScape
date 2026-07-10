import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (t) => {
    t.boolean('is_sophie').defaultTo(false).notNullable();
  });
  await knex.schema.alterTable('children', (t) => {
    t.integer('safety_class_level').defaultTo(0).notNullable();
    t.timestamp('safety_class_completed_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (t) => {
    t.dropColumn('is_sophie');
  });
  await knex.schema.alterTable('children', (t) => {
    t.dropColumn('safety_class_level');
    t.dropColumn('safety_class_completed_at');
  });
}
