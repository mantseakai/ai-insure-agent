// Step 2: Generic Wrapper for Your Current AIService
// File: backend/src/services/GenericAIServiceWrapper.ts

import OpenAI from 'openai';
import RAGService from './RAGService'; // Your existing RAG service
import { DomainConfig } from '../config/InsuranceDomainConfig';
import { AIAnalysis, QueryContext } from '../types/rag';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface GenericAIResponse {
  message: string;
  confidence: number;
  recommendations: any[];
  usedKnowledge: any;
  nextState?: string;
  leadScore?: number;
  shouldCaptureLead?: boolean;
  businessResult?: any;
}

export class GenericAIServiceWrapper {
  private openai: OpenAI;
  private ragService: RAGService;
  private domainConfig: DomainConfig;
  private conversationHistory: Map<string, ConversationMessage[]> = new Map();
  private currentState: string;

  constructor(domainConfig: DomainConfig, companyId: string = 'default') {
    this.domainConfig = domainConfig;
    this.currentState = domainConfig.defaultStage;
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.ragService = new RAGService(companyId);
  }

  async initialize(): Promise<void> {
    await this.ragService.initialize();
    console.log(`✅ Generic AI Service initialized for domain: ${this.domainConfig.domain}`);
  }

  /**
   * Main message processing method - enhanced version of your current processMessage
   */
  async processMessage(
    userMessage: string, 
    userId: string, 
    context: QueryContext = {}
  ): Promise<GenericAIResponse> {
    try {
      // 1. Analyze user input with domain-specific instructions
      const analysis = await this.analyzeUserInputWithDomain(userMessage, userId);

      // 2. Check for business logic triggers (like premium calculation)
      if (this.requiresBusinessLogic(userMessage, analysis)) {
        return await this.handleBusinessLogic(userMessage, userId, analysis, context);
      }

      // 3. Query knowledge base (your existing RAG logic)
      const knowledge = await this.ragService.queryKnowledge(userMessage, {
        productType: analysis.insuranceType,
        stage: this.currentState,
        leadSource: context.leadSource,
        personalityType: context.personalityType,
        budgetRange: context.budget
      });

      // 4. Generate response using domain-specific guidelines
      const response = await this.generateDomainResponse(
        userMessage, 
        knowledge, 
        analysis, 
        context,
        userId
      );

      // 5. Update conversation history
      this.updateConversationHistory(userId, userMessage, response.message);

      // 6. Calculate lead score using domain configuration
      const leadScore = this.calculateDomainLeadScore(analysis, userId);
      const shouldCaptureLead = leadScore >= this.domainConfig.leadCaptureThreshold;

      // 7. Update conversation state
      this.updateConversationState(analysis);

      return {
        message: response.message,
        confidence: knowledge.confidence,
        recommendations: response.recommendations || [],
        usedKnowledge: knowledge.metadata || {},
        nextState: this.currentState,
        leadScore,
        shouldCaptureLead,
        businessResult: null
      };

    } catch (error) {
      console.error('Error processing message:', error);
      return this.handleError(error, userMessage, userId);
    }
  }

  /**
   * Enhanced analysis using domain-specific instructions
   */
  private async analyzeUserInputWithDomain(message: string, userId?: string): Promise<AIAnalysis> {
    const conversationHistory = userId ? this.getConversationHistory(userId) : [];
    const messageCount = Math.floor(conversationHistory.length / 2);
    
    const recentMessages = conversationHistory
      .slice(-4)
      .map(msg => `${msg.role}: ${msg.content.substring(0, 150)}...`)
      .join('\n');

    // Use domain-specific analysis instructions
    const prompt = `
${this.domainConfig.analysisInstructions}

CURRENT MESSAGE: "${message}"

${recentMessages ? `RECENT CONVERSATION:
${recentMessages}

CONVERSATION CONTEXT:
- Exchange Count: ${messageCount}
- Customer Journey: ${messageCount === 0 ? 'New visitor' : messageCount < 3 ? 'Early conversation' : 'Engaged customer'}
` : 'First interaction with customer.'}

${conversationHistory.length > 0 ? 'IMPORTANT: Consider how this message builds on or differs from previous exchanges.' : ''}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.MODEL_NAME || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are an expert at analyzing customer conversations for ${this.domainConfig.domain} sales.`
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
      return this.getDefaultAnalysis();
    }
  }

  /**
   * Check if message requires business logic (e.g., premium calculation)
   */
  private requiresBusinessLogic(message: string, analysis: AIAnalysis): boolean {
    const lowerMessage = message.toLowerCase();
    return this.domainConfig.businessLogicTriggers.some(trigger => 
      lowerMessage.includes(trigger)
    ) || analysis.primaryIntent === 'PRICE_INQUIRY';
  }

  /**
   * Handle business logic like premium calculations
   */
  private async handleBusinessLogic(
    userMessage: string,
    userId: string,
    analysis: AIAnalysis,
    context: QueryContext
  ): Promise<GenericAIResponse> {
    try {
      // Determine which business logic handler to use
      const handlerType = this.determineBusinessLogicType(userMessage, analysis);
      const handler = this.domainConfig.businessLogicHandlers[handlerType];
      
      if (!handler) {
        throw new Error(`No business logic handler found for: ${handlerType}`);
      }

      // Extract parameters for business logic
      const queryParams = this.extractBusinessLogicParams(userMessage, analysis, context);
      const conversationHistory = this.getConversationHistory(userId);
      const customerInfo = this.extractCustomerInfo(conversationHistory);

      // Execute business logic
      const businessResult = await handler(customerInfo, queryParams);

      // Generate response that includes the business result
      const response = await this.generateBusinessLogicResponse(
        userMessage,
        businessResult,
        analysis,
        userId
      );

      this.updateConversationHistory(userId, userMessage, response.message);

      return {
        message: response.message,
        confidence: 0.9,
        recommendations: response.recommendations || [],
        usedKnowledge: { businessLogic: handlerType },
        nextState: this.currentState,
        businessResult,
        leadScore: this.calculateDomainLeadScore(analysis, userId),
        shouldCaptureLead: businessResult ? true : false
      };

    } catch (error) {
      console.error('Business logic error:', error);
      return this.handleError(error, userMessage, userId);
    }
  }

  /**
   * Generate response using domain-specific guidelines
   */
  private async generateDomainResponse(
    userMessage: string,
    knowledge: any,
    analysis: AIAnalysis,
    context: QueryContext,
    userId: string
  ): Promise<{ message: string; recommendations: any[] }> {
    
    const conversationHistory = this.getConversationHistory(userId);
    const messageCount = Math.floor(conversationHistory.length / 2);
    
    const contextSummary = conversationHistory.length > 0 
      ? `Previous conversation (${messageCount} exchanges):
${conversationHistory.slice(-4).map(msg => `${msg.role}: ${msg.content.substring(0, 100)}...`).join('\n')}`
      : 'First interaction - establish rapport and understand needs';
    
    const prompt = `
You are a ${this.domainConfig.domain} agent. Use this knowledge to help the customer:

COMPANY KNOWLEDGE:
${knowledge.context}

USER MESSAGE: "${userMessage}"

USER ANALYSIS:
- Intent: ${analysis.primaryIntent}
- ${this.domainConfig.domain === 'insurance' ? 'Insurance' : 'Product'} Interest: ${analysis.insuranceType || analysis.entityType || 'unknown'}
- Urgency: ${analysis.urgencyLevel}
- Budget Sensitivity: ${analysis.budgetSignals?.join(', ')}
- Emotional State: ${analysis.emotionalState}
- Lead Readiness: ${analysis.leadReadiness}

CONVERSATION CONTEXT:
- Lead Source: ${context.leadSource || 'unknown'}
- Current Stage: ${this.currentState}
- ${contextSummary}

DOMAIN-SPECIFIC GUIDELINES:
${this.domainConfig.responseInstructions}

Generate a helpful, personalized response that moves the conversation forward appropriately.
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.MODEL_NAME || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: this.domainConfig.systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 600
      });

      const message = response.choices[0].message.content || '';
      
      return {
        message,
        recommendations: this.generateRecommendations(analysis)
      };

    } catch (error) {
      console.error('Response generation error:', error);
      throw error;
    }
  }

  /**
   * Calculate lead score using domain configuration
   */
  private calculateDomainLeadScore(analysis: AIAnalysis, userId: string): number {
    const conversationHistory = this.getConversationHistory(userId);
    let score = 0;

    // Apply domain-specific scoring weights
    Object.entries(this.domainConfig.leadScoringWeights).forEach(([factor, weight]) => {
      switch (factor) {
        case 'urgent_need':
          if (analysis.urgencyLevel === 'high') score += weight;
          break;
        case 'budget_discussed':
          if (analysis.budgetSignals?.length > 0) score += weight;
          break;
        case 'specific_coverage':
          if (analysis.insuranceType && analysis.insuranceType !== 'general') score += weight;
          break;
        case 'timeline_mentioned':
          if (analysis.buyingSignals?.includes('timeline_mentioned')) score += weight;
          break;
        case 'quote_request':
          if (analysis.primaryIntent === 'PRICE_INQUIRY') score += weight;
          break;
        // Add more scoring logic as needed
      }
    });

    // Boost for conversation engagement
    const messageCount = Math.floor(conversationHistory.length / 2);
    if (messageCount > 2) score += 5;
    if (messageCount > 5) score += 10;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Update conversation state based on analysis and domain flow
   */
  private updateConversationState(analysis: AIAnalysis): void {
    const stageFlow = this.domainConfig.stageFlow[this.currentState];
    if (stageFlow && stageFlow[analysis.primaryIntent]) {
      this.currentState = stageFlow[analysis.primaryIntent];
    }
  }

  // Helper methods (keeping your existing logic)
  
  private determineBusinessLogicType(message: string, analysis: AIAnalysis): string {
    if (this.domainConfig.domain === 'insurance') {
      return 'premium_calculation';
    }
    return 'default_calculation';
  }

  private extractBusinessLogicParams(message: string, analysis: AIAnalysis, context: QueryContext): any {
    // Extract relevant parameters for business logic
    return {
      insuranceType: analysis.insuranceType || 'auto',
      age: context.age || 30,
      urgency: analysis.urgencyLevel,
      budget: context.budget
    };
  }

  private extractCustomerInfo(conversationHistory: ConversationMessage[]): any {
    // Extract customer information from conversation history
    return {
      messageCount: conversationHistory.length,
      engagement: conversationHistory.length > 4 ? 'high' : 'medium'
    };
  }

  private async generateBusinessLogicResponse(
    userMessage: string,
    businessResult: any,
    analysis: AIAnalysis,
    userId: string
  ): Promise<{ message: string; recommendations?: any[] }> {
    
    const conversationHistory = this.getConversationHistory(userId);
    const customerContext = conversationHistory.length > 0 
      ? `Previous conversation context: Customer has been engaged for ${Math.floor(conversationHistory.length / 2)} exchanges`
      : 'First interaction with customer';

    const prompt = `
You are a ${this.domainConfig.domain} agent providing business calculation results to a customer.

USER MESSAGE: "${userMessage}"

BUSINESS CALCULATION RESULT:
${JSON.stringify(businessResult, null, 2)}

CUSTOMER ANALYSIS:
- Intent: ${analysis.primaryIntent}
- Emotional State: ${analysis.emotionalState}
- Urgency Level: ${analysis.urgencyLevel}
- Lead Readiness: ${analysis.leadReadiness}

CONVERSATION CONTEXT:
${customerContext}

DOMAIN-SPECIFIC GUIDELINES:
${this.domainConfig.responseInstructions}

Create a friendly, professional response that:
1. Acknowledges their specific request
2. Presents the calculation results clearly and attractively
3. Explains what's included in the pricing/calculation
4. Addresses any concerns based on their emotional state
5. Provides clear next steps
6. Builds confidence and trust
7. Uses appropriate ${this.domainConfig.domain} terminology

${this.domainConfig.domain === 'insurance' ? `
For insurance calculations:
- Present premium amounts in Ghana Cedis (GH₵)
- Explain coverage benefits clearly
- Mention policy validity period
- Reference Ghana-specific advantages
- Use encouraging language like "Akwaaba" for new customers
` : ''}

Generate a response that moves the customer closer to a purchase decision.
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.MODEL_NAME || 'gpt-4',
        messages: [
          { 
            role: 'system', 
            content: this.domainConfig.systemPrompt 
          },
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const message = response.choices[0].message.content || this.generateFallbackBusinessResponse(businessResult);

      // Generate recommendations based on the business result
      const recommendations = this.generateBusinessRecommendations(businessResult, analysis);

      return {
        message,
        recommendations
      };

    } catch (error) {
      console.error('Business logic response generation error:', error);
      return {
        message: this.generateFallbackBusinessResponse(businessResult),
        recommendations: [{ type: 'business_result', data: businessResult }]
      };
    }
  }

  /**
   * Generate fallback response when AI generation fails
   */
  private generateFallbackBusinessResponse(businessResult: any): string {
    if (this.domainConfig.domain === 'insurance' && businessResult.premium) {
      return `Great news! I've calculated your insurance premium. Based on your requirements, your premium would be GH₵${businessResult.premium} with a validity of ${businessResult.validity || '30 days'}. This includes comprehensive coverage tailored to your needs. Would you like me to break down what's included or help you proceed with the application?`;
    }

    return `Great! I've calculated the results based on your requirements: ${JSON.stringify(businessResult)}. Would you like me to explain any part of this or help you with the next steps?`;
  }

  /**
   * Generate recommendations based on business logic results
   */
  private generateBusinessRecommendations(businessResult: any, analysis: AIAnalysis): any[] {
    const recommendations = [
      { type: 'business_result', data: businessResult }
    ];

    // Add domain-specific recommendations
    if (this.domainConfig.domain === 'insurance') {
      if (businessResult.premium) {
        recommendations.push({
          type: 'action',
          data:{
          action: 'present_policy_options',
          priority: 'high'}
        });

        // If customer seems price-sensitive, offer alternatives
        if (analysis.budgetSignals?.includes('price_sensitive') || analysis.budgetSignals?.includes('budget_conscious')) {
          recommendations.push({
            type: 'action',
            data:{
            action: 'offer_budget_alternatives',
            priority: 'medium'}
          });
        }

        // If customer is ready, suggest immediate action
        if (analysis.leadReadiness === 'ready' || analysis.leadReadiness === 'hot_lead') {
          recommendations.push({
            type: 'action',
            data:{
            action: 'initiate_application_process',
            priority: 'high'}
          });
        }
      }
    }

    // Add follow-up actions
    if (analysis.urgencyLevel === 'high') {
      recommendations.push({
        type: 'action',
        data:{
        action: 'create_urgency_response',
        priority: 'high'}
      });
    }

    return recommendations;
  }

  private generateRecommendations(analysis: AIAnalysis): any[] {
    const recommendations = [];
    
    if (analysis.leadReadiness === 'ready' || analysis.leadReadiness === 'hot_lead') {
      recommendations.push({ type: 'action', action: 'capture_lead' });
    }
    
    if (analysis.primaryIntent === 'OBJECTION') {
      recommendations.push({ type: 'action', action: 'handle_objection', objectionType: analysis.objectionType });
    }
    
    return recommendations;
  }

  private getDefaultAnalysis(): AIAnalysis {
    return {
      primaryIntent: 'INFORMATION',
      entityType: 'general',
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

  // Keep your existing helper methods
  private getConversationHistory(userId: string): ConversationMessage[] {
    return this.conversationHistory.get(userId) || [];
  }

  private updateConversationHistory(userId: string, userMessage: string, assistantMessage: string): void {
    const history = this.getConversationHistory(userId);
    history.push(
      { role: 'user', content: userMessage, timestamp: new Date() },
      { role: 'assistant', content: assistantMessage, timestamp: new Date() }
    );
    this.conversationHistory.set(userId, history);
  }

  private handleError(error: any, userMessage: string, userId: string): GenericAIResponse {
    return {
      message: this.domainConfig.fallbackMessage,
      confidence: 0.1,
      recommendations: [{ type: 'action', action: 'immediate_human_transfer' }],
      usedKnowledge: {},
      nextState: 'human_handoff'
    };
  }

  // Expose methods for compatibility with your existing code
  getConversationContext(userId: string): any {
    const history = this.getConversationHistory(userId);
    return {
      messageCount: history.length,
      lastActivity: history.length > 0 ? history[history.length - 1].timestamp : null,
      conversationStage: this.currentState,
      domain: this.domainConfig.domain
    };
  }
}

export default GenericAIServiceWrapper;