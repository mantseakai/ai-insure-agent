// Updated Chat Route - Compatible with Generic Architecture
// File: backend/src/routes/chat.ts

import { Router, Request, Response } from 'express';
import GenericAIServiceWrapper from '../services/GenericAIServiceWrapper';
import { InsuranceDomainConfig } from '../config/InsuranceDomainConfig';
import { validateChatMessage } from '../middleware/validation';

const router = Router();
let aiService: GenericAIServiceWrapper | null = null;

// Initialize AI Service with backward compatibility
const initializeAIService = async () => {
  if (!aiService) {
    try {
      aiService = new GenericAIServiceWrapper(InsuranceDomainConfig);
      await aiService.initialize();
      console.log('✅ Original Chat Route AI Service initialized with generic wrapper');
    } catch (error) {
      console.error('❌ Failed to initialize AI Service for chat route:', error);
      throw error;
    }
  }
  return aiService;
};

// Chat endpoint
router.post('/message', validateChatMessage, async (req: Request, res: Response) => {
  try {
    const { message, userId, context = {} } = req.body;

    console.log(`Processing message from user ${userId}: ${message}`);

    const service = await initializeAIService();
    const response = await service.processMessage(message, userId, context);

    res.json({
      success: true,
      data: {
        response: response.message,
        confidence: response.confidence,
        recommendations: response.recommendations || [],
        metadata: {
          usedKnowledge: response.usedKnowledge || {},
          nextState: response.nextState || 'continue',
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process message',
      message: 'I apologize, but I\'m experiencing technical difficulties. Please try again in a moment.'
    });
  }
});

// Get conversation history
router.get('/history/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const service = await initializeAIService();
    const context = service.getConversationContext ? service.getConversationContext(userId) : {};

    res.json({
      success: true,
      data: {
        userId,
        context,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('History endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversation history'
    });
  }
});

// Health check for chat service
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'chat',
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

export default router;