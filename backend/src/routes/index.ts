import { Router } from 'express';
import chatRoutes from './chat';
import leadsRoutes from './leads';
import enhancedChatRoutes from './enhanced-chat';


const router = Router();

// Register all route modules
router.use('/chat/v2', enhancedChatRoutes);  // New V2 routes
router.use('/chat', chatRoutes);
router.use('/leads', leadsRoutes);


// Health check for the API routes
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API routes are working',
    timestamp: new Date().toISOString(),
    routes: {
      chat: '/api/chat',
      leads: '/api/leads'
    }
  });
});

export default router;