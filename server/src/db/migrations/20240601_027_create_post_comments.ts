import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_comments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
    t.uuid('author_id').notNullable();
    t.string('author_type', 20).defaultTo('ai');
    t.text('content').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_comments');
}
