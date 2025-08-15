// Enhanced Chat Routes V2 - Premium Calculation API
// File: backend/src/routes/enhanced-chat.ts

import express, { Request, Response } from 'express';
import Joi from 'joi';
import EnhancedAIService from '../services/EnhancedAIService';
import EnhancedVectorStore from '../services/EnhancedVectorStore';

const router = express.Router();
const aiService = new EnhancedAIService();
const vectorStore = new EnhancedVectorStore();

// Initialize services
let servicesInitialized = false;

const initializeServices = async () => {
  if (!servicesInitialized) {
    console.log('🚀 Initializing Enhanced Chat Services...');
    await aiService.initialize();
    await vectorStore.initialize();
    servicesInitialized = true;
    console.log('✅ Enhanced Chat Services ready');
  }
};

// Request validation schemas
const messageSchema = Joi.object({
  message: Joi.string().required().min(1).max(1000),
  userId: Joi.string().required().min(1).max(100),
  context: Joi.object({
    productType: Joi.string().valid('auto', 'health', 'life', 'business').optional(),
    customerInfo: Joi.object().optional(),
    source: Joi.string().optional()
  }).optional()
});

const premiumCalculationSchema = Joi.object({
  insuranceType: Joi.string().valid('auto', 'health', 'life', 'business').required(),
  parameters: Joi.object().required(),
  userId: Joi.string().required()
});

/**
 * POST /api/chat/message - Enhanced message processing with premium calculation
 */
router.post('/message', async (req: Request, res: Response) => {
  try {
    await initializeServices();

    // Validate request
    const { error, value } = messageSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request format',
        details: error.details[0].message
      });
    }

    const { message, userId, context = {} } = value;

    console.log(`📥 Processing message from user ${userId}: "${message.substring(0, 50)}..."`);

    // Process message with enhanced AI service
    const response = await aiService.processMessage(userId, message);

    // Log important events
    if (response.shouldCaptureLead) {
      console.log(`🎯 Lead captured for user ${userId} with score ${response.leadScore}`);
    }

    if (response.premiumQuote) {
      console.log(`💰 Premium quote generated: GH₵ ${response.premiumQuote.amount}`);
    }

    // Format response
    const formattedResponse = {
      success: true,
      data: {
        message: response.message,
        confidence: response.confidence,
        leadScore: response.leadScore,
        shouldCaptureLead: response.shouldCaptureLead,
        nextAction: response.nextAction,
        context: {
          stage: response.context.stage,
          productType: response.context.productType,
          sentiment: response.context.sentiment,
          premiumCalculationActive: response.context.premiumCalculationState?.isActive || false
        },
        premiumQuote: response.premiumQuote,
        followUpQuestions: response.followUpQuestions,
        timestamp: new Date().toISOString()
      },
      metadata: {
        processingTime: Date.now(),
        version: '2.0'
      }
    };

    res.json(formattedResponse);

  } catch (error) {
    console.error('❌ Enhanced chat service health check failed:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: 'Service initialization failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Helper function to get required parameters for insurance types
function getRequiredParameters(insuranceType: string): string[] {
  const requirements: { [key: string]: string[] } = {
    'auto': ['vehicleValue', 'vehicleAge', 'driverAge', 'location', 'coverageType'],
    'health': ['age', 'planType', 'familySize', 'smokingStatus'],
    'life': ['age', 'coverageAmount', 'policyType', 'smokingStatus'],
    'business': ['businessType', 'employeeCount', 'propertyValue']
  };
  return requirements[insuranceType] || [];
}

export default router;