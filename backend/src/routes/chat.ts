// backend/src/routes/chat.ts
import { Router, Request, Response } from 'express';
import AIService from '../services/AIService';
import { validateChatMessage } from '../middleware/validation';

const router = Router();
const aiService = new AIService();

// Chat endpoint
router.post('/message', validateChatMessage, async (req: Request, res: Response) => {
  try {
    const { message, userId, context = {} } = req.body;

    console.log(`Processing message from user ${userId}: ${message}`);

    const response = await aiService.processMessage(message, userId, context);

    res.json({
      success: true,
      data: {
        response: response.message,
        confidence: response.confidence,
        recommendations: response.recommendations,
        metadata: {
          usedKnowledge: response.usedKnowledge,
          nextState: response.nextState,
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
    const context = aiService.getConversationContext(userId);

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