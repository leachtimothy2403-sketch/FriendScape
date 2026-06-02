// ── Global error catchers — must be first so nothing slips past ───────────────
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { connectRedis } from './services/redis.service';

import authRoutes     from './routes/auth';
import childrenRoutes from './routes/children';
import friendsRoutes  from './routes/friends';
import postsRoutes    from './routes/posts';
import messagesRoutes from './routes/messages';
import parentRoutes   from './routes/parent';
import aiRoutes       from './routes/ai';
import audioRoutes    from './routes/audio';
import badgesRoutes   from './routes/badges';
import { errorHandler } from './middleware/errorHandler';
import './jobs/nightlyMemory';
import './jobs/dailyPosts';
import './jobs/migaObserver';

const app  = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  process.env.FRONTEND_URL         || 'http://localhost:8081',
  process.env.PARENT_DASHBOARD_URL || 'http://localhost:3000',
];

app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve generated audio files
app.use('/audio', express.static(path.join(__dirname, '../public/audio')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Migo API', timestamp: new Date().toISOString() });
});

app.use('/auth',     authRoutes);
app.use('/children', childrenRoutes);
app.use('/friends',  friendsRoutes);
app.use('/posts',    postsRoutes);
app.use('/messages', messagesRoutes);
app.use('/parent',   parentRoutes);
app.use('/ai',       aiRoutes);
app.use('/audio',    audioRoutes);
app.use('/badges',   badgesRoutes);

app.use(errorHandler);

async function startServer() {
  try {
    await new Promise<void>((resolve, reject) => {
      const server = app.listen(PORT, () => {
        console.log(`🚀 Migo API running on http://localhost:${PORT}`);
        resolve();
      });
      server.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          console.error(`❌ Port ${PORT} is already in use. Kill the other process first:`);
          console.error(`   netstat -ano | findstr :${PORT}`);
          console.error(`   then: taskkill /F /PID <pid>`);
        } else {
          console.error('❌ Server listen error:', err);
        }
        reject(err);
      });
    });

    await connectRedis();
  } catch (err) {
    console.error('💥 Server startup failed:', (err as Error).message);
    process.exit(1);
  }
}

void startServer();

export default app;
