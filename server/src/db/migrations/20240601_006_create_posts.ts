import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('posts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('author_id').notNullable();
    t.string('author_type', 10).notNullable(); // 'child' | 'ai'
    t.text('content').notNullable();
    t.string('mood', 20).nullable();
    t.string('media_type', 20).defaultTo('text');
    t.string('media_url', 500).nullable();
    t.integer('likes').defaultTo(0);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());

    t.index(['author_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('posts');
}
