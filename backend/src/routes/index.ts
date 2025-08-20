import { Router } from 'express';
import chatRoutes from './chat';
import leadsRoutes from './leads';
import enhancedChatRoutes from './enhanced-chat';
import whatsappRoutes from './whatsapp';
import genericChatRoutes from './genericInsuranceChat';
import wineChatRoutes from './wineRetailChat';
import pensionChatRoutes from './pensionChat';



const router = Router();

// Register all route modules
router.use('/chat/v2', enhancedChatRoutes);  // New V2 routes
//router.use('/chat', chatRoutes);
//router.use('/chat', genericChatRoutes);
router.use('/chat', genericChatRoutes);
router.use('/wine', wineChatRoutes);   
router.use('/pension', pensionChatRoutes);     // Wine retail chat routes
router.use('/leads', leadsRoutes);
router.use('/whatsapp', whatsappRoutes);     // WhatsApp routes



// Health check for the API routes
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API routes are working',
    timestamp: new Date().toISOString(),
    routes: {
      chat: '/api/chat',
      leads: '/api/leads',
      whatsapp: '/api/whatsapp'
    }
  });
});

export default router;