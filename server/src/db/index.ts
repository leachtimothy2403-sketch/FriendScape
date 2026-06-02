import knex from 'knex';
import config from './knexfile';

const env = (process.env.NODE_ENV || 'development') as 'development' | 'production';
const db = knex(config[env]);

db.raw('SELECT 1')
  .then(() => console.log('✅ PostgreSQL connected'))
  .catch((err: Error) => console.error('❌ PostgreSQL connection failed:', err.message));

export default db;
