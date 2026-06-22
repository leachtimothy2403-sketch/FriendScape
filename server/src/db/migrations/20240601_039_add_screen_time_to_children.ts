import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('children', (t) => {
    t.integer('screen_time_limit_weekday_minutes').nullable().defaultTo(null);
    t.integer('screen_time_limit_weekend_minutes').nullable().defaultTo(null);
    t.integer('screen_time_extension_minutes').nullable().defaultTo(0);
    t.date('screen_time_extension_date').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('children', (t) => {
    t.dropColumn('screen_time_limit_weekday_minutes');
    t.dropColumn('screen_time_limit_weekend_minutes');
    t.dropColumn('screen_time_extension_minutes');
    t.dropColumn('screen_time_extension_date');
  });
}
