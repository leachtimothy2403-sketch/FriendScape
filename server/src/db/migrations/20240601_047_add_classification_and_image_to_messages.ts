import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('messages', (t) => {
    // Set on the child's message row, from the semantic classification returned
    // alongside the AI's reply (see REPLY_JSON_INSTRUCTION in ai.service.ts).
    // Replaces the old keyword/ILIKE approach for the encouraging_messages badge.
    t.boolean('is_encouraging').notNullable().defaultTo(false);
    // Set on the child's message row — was it a comforting response? Used together
    // with the AI message's is_bad_day_moment flag for the kind_words badge.
    t.boolean('is_comforting').notNullable().defaultTo(false);
    // Set on the AI's reply row when it was generated with triggerBadDay — persisted
    // instead of re-guessing from the message text via keyword scan.
    t.boolean('is_bad_day_moment').notNullable().defaultTo(false);
    // Set on the AI's reply row when it comes with an illustrative image attached.
    t.text('image_url').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('messages', (t) => {
    t.dropColumn('is_encouraging');
    t.dropColumn('is_comforting');
    t.dropColumn('is_bad_day_moment');
    t.dropColumn('image_url');
  });
}
