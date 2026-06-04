import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('children', (t) => {
    t.string('school_grade', 20).nullable();
    t.string('school_country', 10).defaultTo('FR');
    t.integer('learning_sessions_count').defaultTo(0);
    t.string('last_subject', 50).nullable();
  });

  await knex.schema.createTable('learning_sessions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('child_id').notNullable().references('id').inTable('children').onDelete('CASCADE');
    t.string('subject', 50).notNullable();
    t.string('grade_at_time', 20).notNullable().defaultTo('unknown');
    t.jsonb('concepts_covered').defaultTo('[]');
    t.string('mode', 20).notNullable().defaultTo('learning');
    t.integer('duration_minutes').nullable();
    t.string('confidence_level', 20).nullable();
    t.boolean('photo_used').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('ended_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('learning_sessions');
  await knex.schema.table('children', (t) => {
    t.dropColumn('school_grade');
    t.dropColumn('school_country');
    t.dropColumn('learning_sessions_count');
    t.dropColumn('last_subject');
  });
}
