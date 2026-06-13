import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('post_comments', (t) => {
    t.boolean('read').defaultTo(false).comment('Mark comment notification as read');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('post_comments', (t) => {
    t.dropColumn('read');
  });
}
