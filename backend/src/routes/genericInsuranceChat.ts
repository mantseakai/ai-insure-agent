// Step 3: Create Test Insurance Agent Route
// File: backend/src/routes/genericInsuranceChat.ts

import { Router, Request, Response } from 'express';
import GenericAIServiceWrapper from '../services/GenericAIServiceWrapper';
import { InsuranceDomainConfig } from '../config/InsuranceDomainConfig';
import { validateChatMessage } from '../middleware/validation';

const router = Router();
let genericInsuranceService: GenericAIServiceWrapper;

// Initialize the generic insurance service
const initializeService = async () => {
  if (!genericInsuranceService) {
    try {
      genericInsuranceService = new GenericAIServiceWrapper(InsuranceDomainConfig, 'default');
      await genericInsuranceService.initialize();
      console.log('✅ Generic Insurance Agent initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Generic Insurance Agent:', error);
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
      message: 'Our insurance agent is temporarily unavailable. Please try again in a moment.'
    });
  }
});

// Generic Insurance Chat endpoint
router.post('/message', validateChatMessage, async (req: Request, res: Response) => {
  try {
    const { message, userId, context = {} } = req.body;

    console.log(`🏥 Processing GENERIC insurance message from user ${userId}: ${message}`);

    const response = await genericInsuranceService.processMessage(message, userId, {
      ...context,
      domain: 'insurance' // Ensure domain is set
    });

    res.json({
      success: true,
      agent: 'generic_insurance',
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
          domain: 'insurance',
          agent_type: 'generic'
        }
      }
    });

  } catch (error) {
    console.error('Generic Insurance chat endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process message',
      message: 'I apologize, but I\'m experiencing technical difficulties. Please try again in a moment.'
    });
  }
});

// Get conversation context for generic insurance agent
router.get('/context/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const context = genericInsuranceService.getConversationContext(userId);

    res.json({
      success: true,
      agent: 'generic_insurance',
      data: {
        userId,
        context,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Generic Insurance context endpoint error:', error);
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
    const genericResponse = await genericInsuranceService.processMessage(message, userId, context);
    
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

// Health check for generic insurance service
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'generic_insurance_chat',
    status: 'operational',
    domain: 'insurance',
    agent_type: 'generic',
    timestamp: new Date().toISOString()
  });
});

export default router;