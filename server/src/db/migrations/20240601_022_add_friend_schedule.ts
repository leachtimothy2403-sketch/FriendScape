import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (table) => {
    table.integer('response_delay_min').notNullable().defaultTo(1);
    table.integer('response_delay_max').notNullable().defaultTo(3);
    table.integer('online_hours_start').notNullable().defaultTo(8);
    table.integer('online_hours_end').notNullable().defaultTo(21);
    table.boolean('is_online').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (table) => {
    table.dropColumn('response_delay_min');
    table.dropColumn('response_delay_max');
    table.dropColumn('online_hours_start');
    table.dropColumn('online_hours_end');
    table.dropColumn('is_online');
  });
}
