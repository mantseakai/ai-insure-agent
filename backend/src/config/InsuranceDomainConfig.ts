// Step 1: Create Insurance Domain Configuration
// File: backend/src/config/InsuranceDomainConfig.ts

export interface DomainConfig {
  domain: string;
  defaultStage: string;
  systemPrompt: string;
  fallbackMessage: string;
  entityTypes: string[];
  stageFlow: Record<string, Record<string, string>>;
  analysisInstructions: string;
  responseInstructions: string;
  businessLogicTriggers: string[];
  businessLogicHandlers: Record<string, (params: any, queryParams: any, dbAdapter?: any) => Promise<any>>;
  leadScoringWeights: Record<string, number>;
  leadCaptureThreshold: number;
}

// Your existing insurance logic wrapped in domain config
export const InsuranceDomainConfig: DomainConfig = {
  domain: 'insurance',
  defaultStage: 'initial_contact',
  systemPrompt: 'You are a knowledgeable, friendly insurance agent in Ghana. Always use accurate company information and provide genuine value. Be conversational and build on previous interactions naturally.',
  fallbackMessage: 'I apologize, but I need a moment to process that. How can I help you with insurance today?',
  
  entityTypes: ['auto', 'health', 'life', 'business', 'property', 'travel'],
  
  stageFlow: {
    'initial_contact': {
      'INFORMATION': 'discovery',
      'PRICE_INQUIRY': 'premium_calculation',
      'READY_TO_BUY': 'closing'
    },
    'discovery': {
      'PRICE_INQUIRY': 'premium_calculation',
      'OBJECTION': 'objection_handling',
      'COMPARISON': 'comparison_mode'
    },
    'premium_calculation': {
      'READY_TO_BUY': 'closing',
      'OBJECTION': 'objection_handling'
    },
    'objection_handling': {
      'INFORMATION': 'discovery',
      'PRICE_INQUIRY': 'premium_calculation',
      'READY_TO_BUY': 'closing'
    }
  },
  
  analysisInstructions: `
Analyze this insurance customer message for intent, needs, and personality. Pay special attention to purchase readiness and lead qualification signals.

Extract and classify:
1. Primary Intent: [INTEREST, PRICE_INQUIRY, OBJECTION, INFORMATION, READY_TO_BUY, COMPARISON, CLAIM_QUESTION, BROWSING]
2. Insurance Type Interest: [auto, health, life, business, property, travel, general]
3. Urgency Level: [high, medium, low] with reasoning
4. Budget Signals: [price_sensitive, budget_conscious, value_focused, premium_interested, price_shocked]
5. Personality Indicators: [analytical, emotional, social_proof_driven, skeptical, impulsive, cautious]
6. Objection Type: [price, trust, necessity, complexity, timing, none]
7. Buying Signals: [comparison_shopping, timeline_mentioned, decision_authority, payment_discussion, quote_request, application_intent]
8. Emotional State: [confident, worried, frustrated, excited, confused, skeptical, interested]
9. Information Needs: [product_details, pricing, claims_process, coverage_comparison, application_process]
10. Next Best Action: [provide_info, handle_objection, create_urgency, transfer_human, continue_nurturing, qualify_further]
11. Lead Readiness: [not_ready, exploring, considering, ready, hot_lead]
12. Conversation Stage: [awareness, interest, consideration, intent, evaluation]

Respond in JSON format with confidence scores (0-1) for each classification.
Include a "leadQualificationNotes" field with specific observations about buying readiness.
`,
  
  responseInstructions: `
1. Use EXACT company information from the knowledge base
2. Address the user's specific intent and emotional state
3. Include relevant pricing and product details when appropriate
4. Reference Ghana-specific context (mobile money, local risks, cultural factors)
5. Use appropriate tone based on personality analysis
6. Include specific next steps or calls to action
7. Handle objections with empathy and evidence
8. Create appropriate urgency without being pushy
9. Use "Akwaaba!" for first-time interactions, "Ayeekoo" for achievements
10. Include emojis naturally to enhance engagement
11. Build naturally on previous conversation - don't repeat information already provided

Generate a helpful, personalized response that moves the conversation forward appropriately.
`,
  
  businessLogicTriggers: ['quote', 'premium', 'price', 'cost', 'calculate', 'how much'],
  
  businessLogicHandlers: {
    'premium_calculation': async (customerInfo: any, queryParams: any, dbAdapter?: any) => {
      // Your existing premium calculation logic with proper typing
      const baseRates: Record<string, Record<string, number>> = {
        auto: { young: 1200, middle: 800, senior: 1000 },
        health: { young: 800, middle: 1200, senior: 1800 },
        life: { young: 600, middle: 1000, senior: 2000 }
      };
      
      const insuranceType: string = queryParams.insuranceType || 'auto';
      const ageGroup: string = queryParams.age < 30 ? 'young' : queryParams.age < 50 ? 'middle' : 'senior';
      
      // Safely access the nested object with fallback
      const typeRates = baseRates[insuranceType];
      const basePremium = typeRates ? typeRates[ageGroup] || 1000 : 1000;
      
      return {
        premium: basePremium,
        breakdown: { 
          base: basePremium * 0.8, 
          fees: basePremium * 0.1, 
          tax: basePremium * 0.1 
        },
        validity: '30 days',
        currency: 'GH₵'
      };
    }
  },
  
  leadScoringWeights: {
    'urgent_need': 15,
    'budget_discussed': 10,
    'specific_coverage': 10,
    'contact_info_shared': 20,
    'timeline_mentioned': 15,
    'quote_request': 25,
    'comparison_shopping': 12
  },
  
  leadCaptureThreshold: 70
};