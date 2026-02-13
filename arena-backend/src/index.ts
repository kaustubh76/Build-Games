import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { commandsRouter } from './routes/commands';
import { statusRouter } from './routes/status';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'warriors-arena-backend',
    port: PORT
  });
});

// API routes
app.use('/api/arena/commands', commandsRouter);
app.use('/api/arena/status', statusRouter);

// Start server
app.listen(PORT, () => {
  console.log(`🎮 Warriors Arena Backend running on port ${PORT}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
});

export default app; 