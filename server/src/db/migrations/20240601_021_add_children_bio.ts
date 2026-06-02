import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('children', (t) => {
    t.string('bio', 255).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('children', (t) => {
    t.dropColumn('bio');
  });
}
