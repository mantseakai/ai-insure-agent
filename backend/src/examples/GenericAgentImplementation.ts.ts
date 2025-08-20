// Implementation Example and Usage Guide
// File: backend/src/examples/GenericAgentImplementation.ts

import GenericAIService from '../services/GenericAIService';
import { createDatabaseAdapter } from '../services/adapters/DatabaseAdapter';
import { getDomainConfig } from '../types/domain';

// Example 1: Setting up an Electronics Retail Agent
async function createElectronicsAgent() {
  const domainConfig = getDomainConfig('electronics');
  const databaseAdapter = createDatabaseAdapter(domainConfig, 'postgresql');
  
  const electronicsAgent = new GenericAIService(domainConfig, databaseAdapter);
  await electronicsAgent.initialize();
  
  return electronicsAgent;
}

// Example 2: Setting up a Fashion Retail Agent
async function createFashionAgent() {
  const domainConfig = getDomainConfig('fashion');
  const databaseAdapter = createDatabaseAdapter(domainConfig, 'mongodb');
  
  const fashionAgent = new GenericAIService(domainConfig, databaseAdapter);
  await fashionAgent.initialize();
  
  return fashionAgent;
}

// Example 3: Using the Generic Agent in a Route
import { Router, Request, Response } from 'express';

export function createGenericChatRouter(domain: string): Router {
  const router = Router();
  let aiService: GenericAIService;

  // Initialize the AI service for the specified domain
  router.use(async (req, res, next) => {
    if (!aiService) {
      try {
        const domainConfig = getDomainConfig(domain);
        const databaseAdapter = createDatabaseAdapter(domainConfig);
        aiService = new GenericAIService(domainConfig, databaseAdapter);
        await aiService.initialize();
        console.log(`✅ ${domain} agent initialized`);
      } catch (error) {
        console.error(`❌ Failed to initialize ${domain} agent:`, error);
        return res.status(500).json({ error: 'Service initialization failed' });
      }
    }
    next();
  });

  // Generic chat endpoint
  router.post('/message', async (req: Request, res: Response) => {
    try {
      const { message, userId, context = {} } = req.body;

      if (!message || !userId) {
        return res.status(400).json({ 
          error: 'Message and userId are required' 
        });
      }

      console.log(`Processing ${domain} message from user ${userId}: ${message}`);

      const response = await aiService.processMessage(userId, message, {
        ...context,
        domain // Ensure domain is always set
      });

      res.json({
        success: true,
        data: {
          response: response.message,
          confidence: response.confidence,
          leadScore: response.leadScore,
          shouldCaptureLead: response.shouldCaptureLead,
          businessResult: response.businessResult,
          metadata: {
            domain,
            nextAction: response.nextAction,
            context: response.context,
            timestamp: new Date().toISOString()
          }
        }
      });

    } catch (error) {
      console.error(`${domain} chat endpoint error:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to process message',
        message: `I apologize, but I'm experiencing technical difficulties. Please try again in a moment.`
      });
    }
  });

  // Get conversation context
  router.get('/context/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      // Implementation would get context from aiService
      res.json({
        success: true,
        data: {
          userId,
          domain,
          // context: aiService.getConversationContext(userId),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error(`${domain} context endpoint error:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve conversation context'
      });
    }
  });

  return router;
}