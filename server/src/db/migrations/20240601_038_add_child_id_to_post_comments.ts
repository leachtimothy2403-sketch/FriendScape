import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('post_comments', (t) => {
    t.uuid('child_id').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('post_comments', (t) => {
    t.dropColumn('child_id');
  });
}
