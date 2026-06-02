import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (t) => {
    t.integer('age').nullable();
    t.string('gender', 30).nullable();
    t.string('cover_emojis', 50).nullable();
    t.jsonb('match_tags').defaultTo('[]');
    t.integer('age_range_min').defaultTo(5);
    t.integer('age_range_max').defaultTo(12);
    t.text('personality_prompt').nullable();
    t.jsonb('teacher_subjects').defaultTo('[]');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_friends', (t) => {
    t.dropColumn('age');
    t.dropColumn('gender');
    t.dropColumn('cover_emojis');
    t.dropColumn('match_tags');
    t.dropColumn('age_range_min');
    t.dropColumn('age_range_max');
    t.dropColumn('personality_prompt');
    t.dropColumn('teacher_subjects');
  });
}
