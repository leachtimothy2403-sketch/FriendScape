import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('posts', (t) => {
    t.uuid('child_id').nullable();   // which child's feed this post belongs to
    t.string('scene_emojis', 50).nullable(); // visual strip emoji string e.g. "🎨🖌️✨"
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('posts', (t) => {
    t.dropColumn('child_id');
    t.dropColumn('scene_emojis');
  });
}
