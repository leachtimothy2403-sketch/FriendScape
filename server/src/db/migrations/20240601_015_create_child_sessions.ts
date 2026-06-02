import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('child_sessions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
    t.timestamp('session_start').defaultTo(knex.fn.now()).notNullable();
    t.timestamp('session_end').nullable();
    t.float('duration_minutes').nullable();
    t.date('date').defaultTo(knex.fn.now()).notNullable();

    t.index(['child_id', 'date']);
    t.index(['child_id', 'session_end']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('child_sessions');
}
