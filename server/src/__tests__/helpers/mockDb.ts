/**
 * Creates a chainable Knex query-builder mock.
 * Each test file calls jest.mock('../../db', dbFactory) using this helper pattern.
 *
 * Usage in test files:
 *   jest.mock('../../db', () => require('./helpers/mockDb').dbFactory());
 *   ...
 *   const { db: mockDb, chain } = jest.requireMock('../../db');
 */

export function buildChain() {
  const chain: Record<string, jest.Mock> = {};

  const returnThisMethods = [
    'where', 'whereIn', 'whereNotIn', 'whereRaw', 'orWhereIn',
    'join', 'leftJoin', 'select', 'orderBy', 'orderByRaw',
    'limit', 'groupBy', 'sum', 'count', 'increment',
    'onConflict', 'insert', 'update',
  ];

  for (const m of returnThisMethods) {
    chain[m] = jest.fn().mockReturnThis();
  }

  chain.first    = jest.fn().mockResolvedValue(null);
  chain.returning = jest.fn().mockResolvedValue([]);
  chain.delete   = jest.fn().mockResolvedValue(0);
  chain.del      = jest.fn().mockResolvedValue(0);
  chain.pluck    = jest.fn().mockResolvedValue([]);
  chain.ignore   = jest.fn().mockResolvedValue(undefined);

  // Make the chain thenable so `await db('table')...select(...)` resolves to []
  chain.then  = jest.fn().mockImplementation((resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve));
  chain.catch = jest.fn().mockImplementation((fn: (e: unknown) => unknown) => Promise.resolve([]).catch(fn));

  return chain;
}

export function dbFactory() {
  const chain = buildChain();

  const db = jest.fn(() => chain) as jest.Mock & {
    raw: jest.Mock;
    fn: { now: jest.Mock };
    seed: { run: jest.Mock };
    chain: typeof chain;
  };

  db.raw  = jest.fn().mockResolvedValue({ rows: [{ cnt: '0', n: '0' }] });
  db.fn   = { now: jest.fn().mockReturnValue(new Date().toISOString()) };
  db.seed = { run: jest.fn().mockResolvedValue(undefined) };
  db.chain = chain;

  return { default: db, chain, __esModule: true };
}
