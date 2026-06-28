import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (t) => {
    t.boolean('is_seasonal').defaultTo(false).notNullable();
    t.string('active_from', 5).nullable();
    t.string('active_until', 5).nullable();
    t.boolean('is_jules').defaultTo(false).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (t) => {
    t.dropColumn('is_seasonal');
    t.dropColumn('active_from');
    t.dropColumn('active_until');
    t.dropColumn('is_jules');
  });
}
