import OpenAI from 'openai';
import RAGService from './RAGService';
import { AIAnalysis, QueryContext } from '../types/rag';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIResponse {
  message: string;
  confidence: number;
  recommendations: any[];
  usedKnowledge: any;
  nextState?: string;
}

class AIService {
  private openai: OpenAI;
  private ragService: RAGService;
  private conversationHistory: Map<string, ConversationMessage[]> = new Map();
  private currentState = 'initial_contact';
  

  constructor(companyId: string = 'default') {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.ragService = new RAGService(companyId);
  }

  async initialize(): Promise<void> {
    await this.ragService.initialize();
    console.log('AI Service initialized successfully');
  }

 async processMessage(
  userMessage: string, 
  userId: string, 
  context: QueryContext = {}
): Promise<AIResponse> {
  try {
    // 1. Analyze user input with conversation context
    const analysis = await this.analyzeUserInput(userMessage, userId);

    // 2. Query company knowledge base with context
    const knowledge = await this.ragService.queryKnowledge(userMessage, {
      productType: analysis.insuranceType,
      stage: this.currentState,
      leadSource: context.leadSource,
      personalityType: context.personalityType,
      budgetRange: context.budget
    });

    // 3. Generate response using RAG knowledge
    const response = await this.generateRAGResponse(
      userMessage, 
      knowledge, 
      analysis, 
      context,
      userId
    );

    // 4. Update conversation history
    this.updateConversationHistory(userId, userMessage, response.message);

    return {
      message: response.message,
      confidence: knowledge.confidence,
      recommendations: response.recommendations,
      usedKnowledge: knowledge.metadata,
      nextState: this.currentState
    };

  } catch (error) {
    console.error('Error processing message:', error);
    return this.handleError(error, userMessage, userId);
  }
}

private async analyzeUserInput(message: string, userId?: string): Promise<AIAnalysis> {
  
  // Get conversation history if userId is provided
  const conversationHistory = userId ? this.getConversationHistory(userId) : [];
  const messageCount = Math.floor(conversationHistory.length / 2);
  
  // Build conversation context
  const recentMessages = conversationHistory
    .slice(-4) // Last 2 exchanges
    .map(msg => `${msg.role}: ${msg.content.substring(0, 150)}...`)
    .join('\n');

  const prompt = `
Analyze this insurance customer message for intent, needs, and personality. Pay special attention to purchase readiness and lead qualification signals.

CURRENT MESSAGE: "${message}"

${recentMessages ? `RECENT CONVERSATION:
${recentMessages}

CONVERSATION CONTEXT:
- Exchange Count: ${messageCount}
- Customer Journey: ${messageCount === 0 ? 'New visitor' : messageCount < 3 ? 'Early conversation' : 'Engaged customer'}
` : 'First interaction with customer.'}

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

${conversationHistory.length > 0 ? 'IMPORTANT: Consider how this message builds on or differs from previous exchanges. Look for progression in interest, commitment, or specific needs.' : ''}

Respond in JSON format with confidence scores (0-1) for each classification.
Include a "leadQualificationNotes" field with specific observations about buying readiness.
`;

  try {
    const response = await this.openai.chat.completions.create({
      model: process.env.MODEL_NAME || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an expert at analyzing customer conversations for insurance sales. ${conversationHistory.length > 0 ? 'Use conversation history to better understand customer intent and progression.' : 'Analyze this first interaction carefully.'}`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    const analysisText = response.choices[0].message.content;
    return JSON.parse(analysisText || '{}');
  } catch (error) {
    console.error('Failed to analyze user input:', error);
    // Return enhanced default analysis
    return {
      primaryIntent: 'INFORMATION',
      urgencyLevel: 'medium',
      budgetSignals: ['budget_conscious'],
      personalityIndicators: ['analytical'],
      buyingSignals: [],
      emotionalState: 'neutral',
      informationNeeds: ['product_details'],
      nextBestAction: 'provide_info',
      leadReadiness: 'exploring',
      conversationStage: 'awareness',
      confidence: 0.5,
      leadQualificationNotes: 'Default analysis due to AI failure'
    };
  }
}

private async generateRAGResponse(
  userMessage: string,
  knowledge: any,
  analysis: AIAnalysis,
  context: QueryContext,
  userId: string
): Promise<{ message: string; recommendations: any[] }> {
  
  const conversationHistory = this.getConversationHistory(userId);
  const messageCount = Math.floor(conversationHistory.length / 2);
  
  // Build conversation context summary
  const contextSummary = conversationHistory.length > 0 
    ? `Previous conversation (${messageCount} exchanges):
${conversationHistory.slice(-4).map(msg => `${msg.role}: ${msg.content.substring(0, 100)}...`).join('\n')}

Conversation notes:
- Customer seems ${analysis.emotionalState || 'neutral'}
- Lead readiness: ${analysis.leadReadiness || 'exploring'}
- Previous topics covered, avoid repetition`
    : 'First interaction - establish rapport and understand needs';
  
  const prompt = `
You are a friendly AI insurance agent in Ghana. Use this knowledge to help the customer:

COMPANY KNOWLEDGE:
${knowledge.context}

USER MESSAGE: "${userMessage}"

USER ANALYSIS:
- Intent: ${analysis.primaryIntent}
- Insurance Interest: ${analysis.insuranceType || 'unknown'}
- Urgency: ${analysis.urgencyLevel}
- Budget Sensitivity: ${analysis.budgetSignals?.join(', ')}
- Personality: ${analysis.personalityIndicators?.join(', ')}
- Emotional State: ${analysis.emotionalState}
- Lead Readiness: ${analysis.leadReadiness}

CONVERSATION CONTEXT:
- Lead Source: ${context.leadSource || 'unknown'}
- Current Stage: ${this.currentState}
- ${contextSummary}

RESPONSE GUIDELINES:
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
11. ${conversationHistory.length > 0 ? 'Build naturally on previous conversation - don\'t repeat information already provided' : 'Start building relationship with warm, helpful tone'}

${analysis.objectionType ? `User has "${analysis.objectionType}" objection. Address this specifically using company knowledge.` : ''}

Generate a helpful, personalized response that moves the conversation forward appropriately:
`;

  try {
    const response = await this.openai.chat.completions.create({
      model: process.env.MODEL_NAME || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a knowledgeable, friendly insurance agent in Ghana. Always use accurate company information and provide genuine value. Be conversational and build on previous interactions naturally.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 600
    });

    const message = response.choices[0].message.content || 'I apologize, but I need a moment to process that. How can I help you with insurance today?';
    
    // Extract recommendations with enhanced context
    const recommendations = await this.extractRecommendations(message, knowledge, analysis, userId);

    return {
      message,
      recommendations
    };

  } catch (error) {
    console.error('Failed to generate RAG response:', error);
    throw error;
  }
}

private async extractRecommendations(
  message: string, 
  knowledge: any, 
  analysis: AIAnalysis,
  userId: string
): Promise<any[]> {
  const recommendations = [];

// Product recommendations based on analysis
if (analysis.insuranceType && knowledge.metadata.hasProductInfo) {
  recommendations.push({
    type: 'product',
    category: analysis.insuranceType,
    urgency: analysis.urgencyLevel,
    reasoning: `Based on user interest in ${analysis.insuranceType} insurance`
  });
}

// AI-POWERED Lead Capture Intent Analysis
console.log('🤖 Starting AI-powered lead capture analysis...');

const conversationHistory = this.getConversationHistory(userId) || [];
const messageCount = Math.floor(conversationHistory.length / 2);

// Use AI to analyze lead capture intent
const leadCaptureAnalysis = await this.analyzeLeadCaptureIntent(
  message, 
  analysis, 
  conversationHistory, 
  messageCount
);

console.log('🎯 AI Lead Capture Analysis Result:', leadCaptureAnalysis);

if (leadCaptureAnalysis.shouldCapture) {
  recommendations.push({
    type: 'action',
    action: 'capture_lead',
    reason: `AI Analysis: ${leadCaptureAnalysis.reason}`,
    confidence: leadCaptureAnalysis.confidence,
    aiAnalysis: {
      primaryIntent: analysis.primaryIntent,
      urgencyLevel: analysis.urgencyLevel,
      buyingSignals: analysis.buyingSignals,
      leadCaptureScore: leadCaptureAnalysis.score,
      riskFactors: leadCaptureAnalysis.riskFactors,
      positiveSignals: leadCaptureAnalysis.positiveSignals
    },
    conversationDepth: messageCount
  });
  console.log('✅ AI recommended lead capture:', leadCaptureAnalysis.reason);
} else {
  console.log('❌ AI recommended NO lead capture:', leadCaptureAnalysis.reason);
}

// Other recommendations...
if (analysis.nextBestAction === 'transfer_human' || analysis.buyingSignals?.includes('decision_authority')) {
  recommendations.push({
    type: 'action',
    action: 'human_handoff',
    reason: 'High buying intent detected - ready for human closer'
  });
}

console.log('🎯 Backend final recommendations:', recommendations);
return recommendations;
}

private async analyzeLeadCaptureIntent(
  userMessage: string,
  analysis: AIAnalysis,
  conversationHistory: any[],
  messageCount: number
): Promise<{
  shouldCapture: boolean;
  confidence: number;
  score: number;
  reason: string;
  riskFactors: string[];
  positiveSignals: string[];
}> {
  
  const recentMessages = conversationHistory.slice(-6).map(msg => `${msg.role}: ${msg.content}`).join('\n');
  
  const prompt = `
You are an expert lead scoring AI for insurance sales. Analyze this conversation to determine if the customer is ready for lead capture.

CURRENT USER MESSAGE: "${userMessage}"

CONVERSATION HISTORY:
${recentMessages || 'No previous conversation'}

CUSTOMER ANALYSIS:
- Primary Intent: ${analysis.primaryIntent}
- Lead Readiness: ${analysis.leadReadiness}
- Urgency Level: ${analysis.urgencyLevel}
- Buying Signals: ${analysis.buyingSignals?.join(', ') || 'none'}
- Emotional State: ${analysis.emotionalState}
- Conversation Depth: ${messageCount} exchanges

ENHANCED SCORING (consider conversation progression):

1. PURCHASE INTENT STRENGTH (0-10):
   Consider: explicit buying language, quote requests, application mentions
   ${messageCount > 0 ? 'IMPORTANT: Has intent strengthened over conversation?' : ''}

2. CONVERSATION PROGRESSION (0-10):
   Consider: movement from general to specific, building engagement, follow-up questions
   ${messageCount > 0 ? 'Look for: deeper questions, more commitment, specific needs' : 'Score based on initial message strength'}

3. NEGATIVE INTENT DETECTION (0-10):
   Consider: browsing language, price shock, explicit disinterest
   0-2: Strong negative signals, 8-10: No negative signals

4. ENGAGEMENT QUALITY (0-10):
   Consider: question specificity, detail provided, conversation investment
   ${messageCount > 0 ? 'Multi-message engagement shows higher commitment' : 'Single message engagement level'}

5. URGENCY & TIMELINE (0-10):
   Consider: timeline mentions, immediate needs, deadline pressure

DECISION LOGIC:
- Base Score = (Intent × 0.3) + (Progression × 0.25) + (Negative × 0.2) + (Engagement × 0.15) + (Urgency × 0.1)
- Capture threshold: ≥ 7.0 for new conversations, ≥ 6.5 for engaged conversations (3+ exchanges)
- ${messageCount < 2 ? 'EARLY CONVERSATION: Require very strong signals (8.0+)' : 'ENGAGED CONVERSATION: Moderate threshold (6.5+)'}

Respond with JSON:
{
  "shouldCapture": boolean,
  "confidence": 0.0-1.0,
  "score": 0.0-10.0,
  "reason": "Decision explanation including conversation context",
  "conversationFactor": "How conversation history influenced decision",
  "riskFactors": [...],
  "positiveSignals": [...],
  "nextBestAction": "continue_conversation|capture_lead|provide_more_info"
}
`;

  try {
    const response = await this.openai.chat.completions.create({
      model: process.env.MODEL_NAME || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a lead scoring expert who considers entire conversations, not just single messages. Be more conservative with new conversations and more liberal with engaged customers showing progression.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1, // Very low for consistent scoring
      max_tokens: 800
    });

    const analysisText = response.choices[0].message.content;
    const leadAnalysis = JSON.parse(analysisText || '{}');

    // Enhanced validation with conversation context
    const result = {
      shouldCapture: leadAnalysis.shouldCapture || false,
      confidence: Math.min(1.0, Math.max(0.0, leadAnalysis.confidence || 0.5)),
      score: Math.min(10.0, Math.max(0.0, leadAnalysis.score || 0.0)),
      reason: leadAnalysis.reason || 'Conversation-aware analysis completed',
      riskFactors: leadAnalysis.riskFactors || [],
      positiveSignals: leadAnalysis.positiveSignals || []
    };

    // Conversation-aware thresholds
    const threshold = messageCount < 2 ? 8.0 : 6.5;
    
    if (result.score < threshold) {
      result.shouldCapture = false;
      result.reason = `Score ${result.score.toFixed(1)}/10 below threshold (${threshold}) for ${messageCount < 2 ? 'new' : 'engaged'} conversation`;
    }

    // Additional safety for very early conversations
    if (messageCount === 0 && result.score < 8.5) {
      result.shouldCapture = false;
      result.reason = `First message requires very strong signals (8.5+): ${result.reason}`;
    }

    console.log(`🎯 Lead Analysis: ${result.shouldCapture ? 'CAPTURE' : 'NO CAPTURE'} - Score: ${result.score.toFixed(1)}/10, Messages: ${messageCount}, Threshold: ${threshold}`);

    return result;

  } catch (error) {
    console.error('Failed to analyze lead capture intent:', error);
    
    return {
      shouldCapture: false,
      confidence: 0.1,
      score: 0.0,
      reason: 'Analysis failed - defaulting to conservative approach',
      riskFactors: ['AI analysis unavailable'],
      positiveSignals: []
    };
  }
}

  private updateConversationHistory(userId: string, userMessage: string, aiResponse: string): void {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }

    const history = this.conversationHistory.get(userId)!;
    history.push(
      {
        role: 'user',
        content: userMessage,
        timestamp: new Date()
      },
      {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date()
      }
    );

    // Keep last 10 messages
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }
  }

  private getConversationHistory(userId: string): ConversationMessage[] {
    return this.conversationHistory.get(userId) || [];
  }

  private async handleError(error: any, userMessage: string, userId: string): Promise<AIResponse> {
    console.error('AI Service Error:', error);
    
    const fallbackResponse = `I apologize, but I'm having a technical moment! 😅 Let me connect you with one of our human agents who can help you right away.`;
    
    return {
      message: fallbackResponse,
      confidence: 0.1,
      recommendations: [{ type: 'action', action: 'immediate_human_transfer' }],
      usedKnowledge: {},
      nextState: 'human_handoff'
    };
  }

  // Method to get conversation context for lead scoring
  getConversationContext(userId: string): any {
    const history = this.getConversationHistory(userId);
    return {
      messageCount: history.length,
      lastActivity: history.length > 0 ? history[history.length - 1].timestamp : null,
      conversationStage: this.currentState
    };
  }
}

export default AIService;