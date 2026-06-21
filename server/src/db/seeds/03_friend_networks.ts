import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('ai_friend_network').del();

  // Fixed IDs for the new network friends
  const LEA_ID    = 'b1000001-0000-0000-0000-000000000001';
  const TOM_ID    = 'b1000002-0000-0000-0000-000000000002';
  const CHLOE_ID  = 'b1000003-0000-0000-0000-000000000003';
  const HUGO_ID   = 'b1000004-0000-0000-0000-000000000004';
  const NICO_ID   = 'b1000005-0000-0000-0000-000000000005';
  const CAMILLE_ID = 'b1000006-0000-0000-0000-000000000006';
  const LUCA_ID   = 'b1000007-0000-0000-0000-000000000007';
  const SOFIA_ID  = 'b1000008-0000-0000-0000-000000000008';

  // Look up existing core friends by name
  const [mia, jake, zara, coachMike] = await Promise.all([
    knex('ai_friends').where({ name: 'Mia' }).first(),
    knex('ai_friends').where({ name: 'Jake' }).first(),
    knex('ai_friends').where({ name: 'Zara' }).first(),
    knex('ai_friends').where({ name: 'Coach Mike' }).first(),
  ]);

  if (!mia || !jake || !zara || !coachMike) {
    throw new Error('Core AI friends not found — run 01_ai_friends seed first');
  }

  const MIA_ID  = mia.id as string;
  const JAKE_ID = jake.id as string;
  const ZARA_ID = zara.id as string;
  const MIKE_ID = coachMike.id as string;

  await knex('ai_friend_network').insert([
    // ── Mia's network ─────────────────────────────────────────────────────────
    { ai_friend_id: MIA_ID, connected_friend_id: LEA_ID,    relationship_type: 'close_friend',  relationship_description: 'Mia and Léa met in art class and bond over painting and their cats' },
    { ai_friend_id: MIA_ID, connected_friend_id: CHLOE_ID,  relationship_type: 'close_friend',  relationship_description: "Mia loves Chloé's stories almost as much as her own drawings" },
    { ai_friend_id: MIA_ID, connected_friend_id: TOM_ID,    relationship_type: 'neighbour',     relationship_description: 'Tom lives next door — they have nothing in common but he makes Mia laugh every day' },
    { ai_friend_id: MIA_ID, connected_friend_id: HUGO_ID,   relationship_type: 'cousin',        relationship_description: "Hugo is Mia's cousin — slightly annoying but secretly her favourite" },
    { ai_friend_id: MIA_ID, connected_friend_id: ZARA_ID,   relationship_type: 'star',          relationship_description: 'Mia follows Zara for drama inspiration' },

    // ── Jake's network ────────────────────────────────────────────────────────
    { ai_friend_id: JAKE_ID, connected_friend_id: NICO_ID,    relationship_type: 'teammate',     relationship_description: 'Jake and Nico have been football best mates since their first goal together' },
    { ai_friend_id: JAKE_ID, connected_friend_id: LUCA_ID,    relationship_type: 'classmate',    relationship_description: 'Luca sits next to Jake in class — different worlds but real friends' },
    { ai_friend_id: JAKE_ID, connected_friend_id: CAMILLE_ID, relationship_type: 'neighbour',    relationship_description: 'Camille lives next door — Jake talks football, she talks dance, somehow it works' },
    { ai_friend_id: JAKE_ID, connected_friend_id: MIKE_ID,    relationship_type: 'star',         relationship_description: "Jake's sporting hero" },
    { ai_friend_id: JAKE_ID, connected_friend_id: MIA_ID,     relationship_type: 'online_friend', relationship_description: 'Jake and Mia connected through Migo — both sports fans' },

    // ── Zara's network ────────────────────────────────────────────────────────
    { ai_friend_id: ZARA_ID, connected_friend_id: SOFIA_ID, relationship_type: 'close_friend',  relationship_description: 'Drama club co-stars and best friends' },
    { ai_friend_id: ZARA_ID, connected_friend_id: MIA_ID,   relationship_type: 'online_friend', relationship_description: 'Zara and Mia connected over creativity' },
    { ai_friend_id: ZARA_ID, connected_friend_id: MIKE_ID,  relationship_type: 'star',          relationship_description: 'Zara follows Coach Mike for sports motivation' },

    // ── Coach Mike's network ──────────────────────────────────────────────────
    { ai_friend_id: MIKE_ID, connected_friend_id: JAKE_ID,  relationship_type: 'online_friend', relationship_description: "Jake is Coach Mike's biggest football fan" },
    { ai_friend_id: MIKE_ID, connected_friend_id: NICO_ID,  relationship_type: 'teammate',      relationship_description: "Coach Mike coaches Nico's team" },
  ]);
}
