// Step 3: Create Test Wine Retail Agent Route
// File: backend/src/routes/wineRetailChat.ts

import { Router, Request, Response } from 'express';
import GenericAIServiceWrapper from '../services/GenericAIServiceWrapper';
import { WineRetailDomainConfig } from '../config/WineRetailDomainConfig';
import { validateChatMessage } from '../middleware/validation';

const router = Router();
let genericWineRetailService: GenericAIServiceWrapper;

// Initialize the generic wine retail service
const initializeService = async () => {
  if (!genericWineRetailService) {
    try {
      genericWineRetailService = new GenericAIServiceWrapper(WineRetailDomainConfig, 'default');
      await genericWineRetailService.initialize();
      console.log('✅ Generic Wine Retail Agent initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Generic Wine Retail Agent:', error);
      throw error;
    }
  }
};

// Middleware to ensure service is initialized
router.use(async (req, res, next) => {
  try {
    await initializeService();
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Service initialization failed',
      message: 'Our wine retail agent is temporarily unavailable. Please try again in a moment.'
    });
  }
});

// Generic Wine Retail Chat endpoint
router.post('/message', validateChatMessage, async (req: Request, res: Response) => {
  try {
    const { message, userId, context = {} } = req.body;

    console.log(`🍷 Processing WINE RETAIL message from user ${userId}: ${message}`);

    const response = await genericWineRetailService.processMessage(message, userId, {
      ...context,
      domain: 'wine_retail' // Ensure domain is set
    });

    res.json({
      success: true,
      agent: 'wine_retail',
      data: {
        response: response.message,
        confidence: response.confidence,
        leadScore: response.leadScore,
        shouldCaptureLead: response.shouldCaptureLead,
        businessResult: response.businessResult,
        recommendations: response.recommendations,
        metadata: {
          usedKnowledge: response.usedKnowledge,
          nextState: response.nextState,
          timestamp: new Date().toISOString(),
          domain: 'wine_retail',
          agent_type: 'generic'
        }
      }
    });

  } catch (error) {
    console.error('Generic Wine Retail chat endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process message',
      message: 'I apologize, but I\'m experiencing technical difficulties. Please try again in a moment.'
    });
  }
});

// Get conversation context for generic wine retail agent
router.get('/context/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const context = genericWineRetailService.getConversationContext(userId);

    res.json({
      success: true,
      agent: 'wine_retail',
      data: {
        userId,
        context,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Generic Wine Retail context endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve conversation context'
    });
  }
});

// Compare with original agent endpoint (for testing)
router.post('/compare', validateChatMessage, async (req: Request, res: Response) => {
  try {
    const { message, userId, context = {} } = req.body;
    
    // Process with generic agent
    const genericResponse = await genericWineRetailService.processMessage(message, userId, context);
    
    // TODO: Also process with your original AIService for comparison
    // const originalService = new AIService('default');
    // await originalService.initialize();
    // const originalResponse = await originalService.processMessage(message, userId, context);

    res.json({
      success: true,
      comparison: {
        generic: {
          message: genericResponse.message,
          confidence: genericResponse.confidence,
          leadScore: genericResponse.leadScore,
          hasBusinessResult: !!genericResponse.businessResult
        },
        // original: {
        //   message: originalResponse.message,
        //   confidence: originalResponse.confidence,
        //   hasBusinessResult: false
        // }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Compare endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process comparison'
    });
  }
});

// Health check for generic wine retail service
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'generic_wine_retail_chat',
    status: 'operational',
    domain: 'wine_retail',
    agent_type: 'generic',
    timestamp: new Date().toISOString()
  });
});

export default router;