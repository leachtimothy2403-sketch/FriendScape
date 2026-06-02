import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('enrollments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('parent_email', 255).notNullable();
    t.string('approval_token', 255).unique().notNullable();
    t.enu('status', ['pending', 'approved', 'expired']).notNullable().defaultTo('pending');
    t.string('child_device_id', 255).nullable();
    t.timestamp('expires_at').notNullable();
    t.timestamp('approved_at').nullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('enrollments');
}
