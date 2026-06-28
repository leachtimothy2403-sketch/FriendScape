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

import { execSync } from 'child_process';
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
import avatarRoutes   from './routes/avatar';
import badgesRoutes          from './routes/badges';
import notificationsRoutes   from './routes/notifications';
import { errorHandler } from './middleware/errorHandler';
import './jobs/nightlyMemory';
import './jobs/dailyPosts';
import './jobs/migaObserver';
import './jobs/onlineStatus';
import './jobs/friendCheckIn';
import { scheduleGradePromotion } from './jobs/gradePromotion';
scheduleGradePromotion();

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
app.use('/avatar',   avatarRoutes);
app.use('/badges',         badgesRoutes);
app.use('/notifications',  notificationsRoutes);

app.use(errorHandler);

async function startServer() {
  try {
    await new Promise<void>((resolve, reject) => {
      const server = app.listen(PORT, () => {
        console.log(`🚀 Migo API running on http://localhost:${PORT}`);
        // Pre-warm Jules audio cache on startup
        setTimeout(() => {
          void import('./services/audio.service').then(({ generateSpeech }) => {
            const fr = "Salut ! Trop cool de te voir ici. Pour préparer tes missions de la semaine, tu peux me dire en quelle classe tu vas à la rentrée ?";
            const en = "Hey! So great to have you here. To set up your missions, can you tell me what grade you'll be going into in September?";
            void generateSpeech(fr, 'jules', 'fr').catch(() => {});
            void generateSpeech(en, 'jules', 'en').catch(() => {});
            console.log('[startup] 🧭 Pre-warming Jules audio cache...');
          });
        }, 8000);
        resolve();
      });
      server.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          console.log(`⚠️  Port ${PORT} in use — killing stale process and retrying...`);
          try {
            const result = execSync(`netstat -ano | findstr :${PORT}`).toString();
            const pid = result.match(/LISTENING\s+(\d+)/)?.[1];
            if (pid) {
              execSync(`taskkill /F /PID ${pid}`);
              console.log(`[dev] ✅ Killed PID ${pid} — restarting in 1s...`);
              setTimeout(() => void startServer(), 1000);
            } else {
              reject(err);
            }
          } catch {
            console.error('❌ Port 3001 is already in use. Kill manually:');
            console.error(`   netstat -ano | findstr :${PORT}`);
            console.error(`   then: taskkill /F /PID <pid>`);
            process.exit(1);
          }
        } else {
          console.error('❌ Server listen error:', err);
          reject(err);
        }
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
