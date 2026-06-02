import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('parent_alerts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
    t.string('type', 20).notNullable(); // 'mood_flag' | 'milestone' | 'crisis' | 'learning'
    t.text('message').notNullable();
    t.string('severity', 10).defaultTo('info'); // 'info' | 'warning' | 'urgent'
    t.boolean('read').defaultTo(false);
    t.string('action_url', 500).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());

    t.index(['child_id', 'read', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('parent_alerts');
}
