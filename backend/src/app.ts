import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

// Import routes
import apiRoutes from './routes';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for QR pages
      // Allow images from Google Charts, QR Server APIs, and data URLs
      imgSrc: [
        "'self'", 
        "data:", 
        "https://chart.googleapis.com",
        "https://api.qrserver.com",
        "https://chart.googleapis.com",
        "blob:"
      ],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

// API routes
app.use('/api', apiRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

export default app;