import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('parent_alerts', (t) => {
    t.timestamp('read_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('parent_alerts', (t) => {
    t.dropColumn('read_at');
  });
}
