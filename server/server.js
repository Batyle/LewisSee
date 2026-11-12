import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import authRoutes from './routes/authRoutes.js';
import instructorAuthRoutes from './routes/instructorAuthRoutes.js';
import blockRoutes from './routes/blockRoutes.js';

if (!process.env.ADMIN_JWT_SECRET || !process.env.JWT_SECRET) throw new Error('JWT_SECRET and ADMIN_JWT_SECRET must be configured.');

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/instructor-auth', instructorAuthRoutes);
app.use('/api/blocks', blockRoutes);
app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: 'An unexpected server error occurred.' });
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`API listening on port ${port}`));
