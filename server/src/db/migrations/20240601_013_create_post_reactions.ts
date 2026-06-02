import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_reactions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
    t.uuid('child_id').notNullable();
    t.string('emoji', 10).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['post_id', 'child_id', 'emoji']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('post_reactions');
}
