// Generic AI Service for Multi-Domain Retail Applications
// File: backend/src/services/GenericAIService.ts

import OpenAI from 'openai';
import { GenericRAGService } from './GenericRAGService';
import { DatabaseAdapter } from './adapters/DatabaseAdapter';
import { DomainConfig } from '../types/domain';

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
}

interface GenericContext {
  domain: string; // 'insurance', 'electronics', 'clothing', 'automotive', etc.
  stage: string; // Domain-specific stages
  entityType?: string; // Product/service type within domain
  customerInfo: Record<string, any>;
  businessLogic?: Record<string, any>; // Domain-specific calculations/rules
  [key: string]: any;
}

interface AIResponse {
  message: string;
  confidence: number;
  leadScore: number;
  shouldCaptureLead: boolean;
  nextAction: string;
  context: GenericContext;
  businessResult?: any; // Domain-specific results (quotes, recommendations, etc.)
  followUpQuestions?: string[];
}

interface Recommendation {
  type: string;
  action?: string;
  data?: any;
  priority?: 'urgent' | 'high' | 'medium' | 'low';
}

export class GenericAIService {
  private openai: OpenAI;
  private ragService: GenericRAGService;
  private databaseAdapter?: DatabaseAdapter;
  private domainConfig: DomainConfig;
  private conversations: Map<string, any> = new Map();

  constructor(
    domainConfig: DomainConfig,
    databaseAdapter?: DatabaseAdapter
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || ''
    });
    this.domainConfig = domainConfig;
    this.ragService = new GenericRAGService(domainConfig);
    this.databaseAdapter = databaseAdapter; // Make it optional
  }

  /**
   * Initialize the service with domain-specific configuration
   */
  async initialize(): Promise<void> {
    console.log(`🤖 Initializing Generic AI Service for domain: ${this.domainConfig.domain}`);
    await this.ragService.initialize();
    
    // Only initialize database adapter if provided
    if (this.databaseAdapter) {
      await this.databaseAdapter.initialize();
      console.log('✅ Database adapter initialized');
    } else {
      console.log('ℹ️  No database adapter provided - running without database integration');
    }
    
    console.log('✅ Generic AI Service ready');
  }

  /**
   * Process user message with domain-agnostic approach
   */
  async processMessage(userId: string, message: string, contextOverride?: Partial<GenericContext>): Promise<AIResponse> {
    try {
      // Get or create conversation
      let conversation = this.conversations.get(userId) || this.createNewConversation(userId);

      // Apply context override if provided
      if (contextOverride) {
        conversation.context = { ...conversation.context, ...contextOverride };
      }

      // Add user message to history
      conversation.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date()
      });

      // Analyze message using domain configuration
      const messageAnalysis = await this.analyzeMessage(message, conversation.context);

      // Update conversation context
      conversation.context = this.updateContext(conversation.context, messageAnalysis, message);

      // Check for domain-specific business logic (quotes, calculations, etc.)
      if (messageAnalysis.requiresBusinessLogic) {
        return await this.handleBusinessLogic(userId, message, conversation, messageAnalysis);
      }

      // Query knowledge base with enhanced context
      const ragResult = await this.ragService.queryKnowledge(message, {
        domain: this.domainConfig.domain,
        entityType: conversation.context.entityType,
        stage: conversation.context.stage,
        customerInfo: conversation.context.customerInfo,
        conversationHistory: conversation.messages.slice(-3)
      });

      // Query database if needed and adapter is available
      let databaseResults = null;
      if (messageAnalysis.requiresDatabaseQuery && this.databaseAdapter) {
        try {
          databaseResults = await this.databaseAdapter.query(
            messageAnalysis.queryParams,
            conversation.context
          );
        } catch (error) {
          console.error('❌ Database query failed:', error);
          // Continue without database results
        }
      } else if (messageAnalysis.requiresDatabaseQuery && !this.databaseAdapter) {
        console.warn('⚠️ Database query requested but no adapter available');
      }

      // Generate response using domain-specific prompts
      const response = await this.generateDomainResponse(
        message,
        conversation,
        ragResult,
        databaseResults,
        messageAnalysis
      );

      // Update conversation
      conversation.messages.push({
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
        metadata: { confidence: response.confidence, leadScore: response.leadScore }
      });

      conversation.leadScore = response.leadScore;
      conversation.lastUpdated = new Date();
      this.conversations.set(userId, conversation);

      return response;

    } catch (error) {
      console.error('❌ Error processing message:', error);
      return this.handleError(error, message, userId);
    }
  }

  /**
   * Analyze message with domain-specific intelligence
   */
  private async analyzeMessage(message: string, context: GenericContext): Promise<any> {
    const analysisPrompt = this.buildAnalysisPrompt(message, context);

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.MODEL_NAME || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an expert analyzer for ${this.domainConfig.domain} domain. 
                     Analyze customer messages for intent, entity types, business logic needs, and database queries.`
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      console.error('Failed to analyze message:', error);
      return this.getDefaultAnalysis(message, context);
    }
  }

  /**
   * Build domain-specific analysis prompt
   */
  private buildAnalysisPrompt(message: string, context: GenericContext): string {
    const domainSpecifics = this.domainConfig.analysisInstructions || '';
    const entityTypes = this.domainConfig.entityTypes?.join(', ') || 'products';
    const businessLogicTriggers = this.domainConfig.businessLogicTriggers?.join(', ') || '';

    return `
Analyze this ${this.domainConfig.domain} customer message:

MESSAGE: "${message}"

DOMAIN CONTEXT:
- Domain: ${this.domainConfig.domain}
- Available entity types: ${entityTypes}
- Current stage: ${context.stage}
- Business logic triggers: ${businessLogicTriggers}

${domainSpecifics}

REQUIRED ANALYSIS (return as JSON):
{
  "primaryIntent": "string", 
  "entityType": "string",
  "urgencyLevel": "high|medium|low",
  "emotionalState": "string",
  "requiresBusinessLogic": boolean,
  "businessLogicType": "string",
  "requiresDatabaseQuery": boolean,
  "queryParams": {},
  "leadReadiness": "string",
  "nextBestAction": "string",
  "confidence": number
}
`;
  }

  /**
   * Handle domain-specific business logic (quotes, calculations, recommendations)
   */
  private async handleBusinessLogic(
    userId: string,
    message: string,
    conversation: any,
    analysis: any
  ): Promise<AIResponse> {
    try {
      // Use domain configuration to determine business logic handler
      const businessLogicHandler = this.domainConfig.businessLogicHandlers?.[analysis.businessLogicType];
      
      if (!businessLogicHandler) {
        throw new Error(`No handler found for business logic: ${analysis.businessLogicType}`);
      }

      // Execute business logic
      const businessResult = await businessLogicHandler(
        conversation.context.customerInfo,
        analysis.queryParams,
        this.databaseAdapter // Pass the adapter (could be undefined)
      );

      // Generate response with business result
      const response = await this.generateBusinessLogicResponse(
        message,
        conversation,
        businessResult,
        analysis
      );

      return {
        ...response,
        businessResult
      };

    } catch (error) {
      console.error('❌ Business logic error:', error);
      return this.handleError(error, message, userId);
    }
  }

  /**
   * Generate domain-specific response
   */
  private async generateDomainResponse(
    message: string,
    conversation: any,
    ragResult: any,
    databaseResults: any,
    analysis: any
  ): Promise<AIResponse> {
    const responsePrompt = this.buildResponsePrompt(
      message,
      conversation,
      ragResult,
      databaseResults,
      analysis
    );

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.MODEL_NAME || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: this.domainConfig.systemPrompt || `You are a helpful ${this.domainConfig.domain} assistant.`
          },
          {
            role: 'user',
            content: responsePrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 600
      });

      const responseText = response.choices[0].message.content || '';
      
      return {
        message: responseText,
        confidence: ragResult?.confidence || 0.7,
        leadScore: this.calculateLeadScore(analysis, conversation),
        shouldCaptureLead: this.shouldCaptureLead(analysis, conversation),
        nextAction: analysis.nextBestAction || 'continue_conversation',
        context: conversation.context,
        followUpQuestions: this.generateFollowUpQuestions(analysis, conversation)
      };

    } catch (error) {
      console.error('❌ Response generation error:', error);
      throw error;
    }
  }

  /**
   * Build response prompt with domain-specific context
   */
  private buildResponsePrompt(
    message: string,
    conversation: any,
    ragResult: any,
    databaseResults: any,
    analysis: any
  ): string {
    const domainInstructions = this.domainConfig.responseInstructions || '';
    const conversationHistory = conversation.messages.slice(-4)
      .map((msg: any) => `${msg.role}: ${msg.content.substring(0, 150)}...`)
      .join('\n');

    return `
DOMAIN: ${this.domainConfig.domain}
CUSTOMER MESSAGE: "${message}"

KNOWLEDGE BASE CONTEXT:
${ragResult?.context || 'No relevant knowledge found'}

${databaseResults ? `DATABASE RESULTS:
${JSON.stringify(databaseResults, null, 2)}` : ''}

CUSTOMER ANALYSIS:
- Intent: ${analysis.primaryIntent}
- Entity Interest: ${analysis.entityType}
- Emotional State: ${analysis.emotionalState}
- Lead Readiness: ${analysis.leadReadiness}

CONVERSATION HISTORY:
${conversationHistory}

DOMAIN-SPECIFIC INSTRUCTIONS:
${domainInstructions}

Generate a helpful, personalized response that:
1. Uses accurate domain knowledge
2. Addresses the customer's specific intent
3. Moves the conversation forward appropriately
4. Follows domain-specific tone and style guidelines
5. Includes relevant ${this.domainConfig.domain} context
`;
  }

  /**
   * Create new conversation with domain context
   */
  private createNewConversation(userId: string): any {
    return {
      userId,
      messages: [],
      context: {
        domain: this.domainConfig.domain,
        stage: this.domainConfig.defaultStage || 'greeting',
        customerInfo: {},
        leadQualified: false,
        sentiment: 'neutral'
      },
      leadScore: 0,
      lastUpdated: new Date()
    };
  }

  /**
   * Update conversation context based on analysis
   */
  private updateContext(
    currentContext: GenericContext,
    analysis: any,
    message: string
  ): GenericContext {
    return {
      ...currentContext,
      stage: this.determineNextStage(currentContext.stage, analysis),
      entityType: analysis.entityType || currentContext.entityType,
      customerInfo: {
        ...currentContext.customerInfo,
        ...this.extractCustomerInfo(message, analysis)
      }
    };
  }

  /**
   * Determine next conversation stage based on domain flow
   */
  private determineNextStage(currentStage: string, analysis: any): string {
    const stageFlow = this.domainConfig.stageFlow || {};
    const nextStage = stageFlow[currentStage]?.[analysis.primaryIntent];
    return nextStage || currentStage;
  }

  /**
   * Extract customer information from message
   */
  private extractCustomerInfo(message: string, analysis: any): Record<string, any> {
    // Implement domain-specific information extraction
    const customerInfo: Record<string, any> = {};

    // Extract common information patterns
    const ageMatch = message.match(/(\d+)\s*(?:years?\s*old|yr|y\.o\.)/i);
    if (ageMatch) {
      customerInfo.age = parseInt(ageMatch[1]);
    }

    const budgetMatch = message.match(/budget.*?(\d+)/i) || message.match(/(\d+).*?budget/i);
    if (budgetMatch) {
      customerInfo.budget = parseInt(budgetMatch[1]);
    }

    // Domain-specific extraction
    switch (this.domainConfig.domain) {
      case 'insurance':
        if (message.toLowerCase().includes('car') || message.toLowerCase().includes('vehicle')) {
          customerInfo.vehicleType = 'car';
        }
        if (message.toLowerCase().includes('health') || message.toLowerCase().includes('medical')) {
          customerInfo.insuranceType = 'health';
        }
        break;

      case 'electronics':
        if (message.toLowerCase().includes('gaming')) {
          customerInfo.useCase = 'gaming';
        }
        if (message.toLowerCase().includes('work') || message.toLowerCase().includes('office')) {
          customerInfo.useCase = 'professional';
        }
        break;

      case 'fashion':
        if (message.toLowerCase().includes('work') || message.toLowerCase().includes('office')) {
          customerInfo.occasion = 'professional';
        }
        if (message.toLowerCase().includes('party') || message.toLowerCase().includes('event')) {
          customerInfo.occasion = 'formal';
        }
        break;
    }

    return customerInfo;
  }

  /**
   * Calculate lead score based on domain-specific criteria
   */
  private calculateLeadScore(analysis: any, conversation: any): number {
    const scoreWeights = this.domainConfig.leadScoringWeights || {};
    let score = conversation.leadScore || 0;

    // Apply domain-specific scoring logic
    Object.entries(scoreWeights).forEach(([factor, weight]) => {
      switch (factor) {
        case 'urgent_need':
          if (analysis.urgencyLevel === 'high') score += (weight as number);
          break;
        case 'budget_discussed':
          if (analysis.budgetSignals?.length > 0) score += (weight as number);
          break;
        case 'specific_coverage':
        case 'specific_model_interest':
        case 'specific_item_interest':
          if (analysis.entityType && analysis.entityType !== 'general') score += (weight as number);
          break;
        case 'contact_info_shared':
          if (conversation.context.customerInfo?.email || conversation.context.customerInfo?.phone) {
            score += (weight as number);
          }
          break;
        case 'timeline_mentioned':
          if (analysis.buyingSignals?.includes('timeline_mentioned')) score += (weight as number);
          break;
        case 'quote_request':
        case 'price_inquiry':
          if (analysis.primaryIntent === 'PRICE_INQUIRY') score += (weight as number);
          break;
        case 'comparison_shopping':
          if (analysis.primaryIntent === 'COMPARISON_REQUEST') score += (weight as number);
          break;
        case 'immediate_need':
          if (analysis.urgencyLevel === 'high') score += (weight as number);
          break;
        case 'technical_questions':
          if (analysis.informationNeeds?.includes('technical_specs')) score += (weight as number);
          break;
        case 'style_consultation':
          if (analysis.primaryIntent === 'STYLE_QUESTION') score += (weight as number);
          break;
      }
    });

    // Boost for conversation engagement
    const messageCount = Math.floor(conversation.messages.length / 2);
    if (messageCount > 2) score += 5;
    if (messageCount > 5) score += 10;

    // Boost for business logic engagement (quotes, calculations)
    if (conversation.context.businessLogic?.hasEngaged) score += 15;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Determine if lead should be captured based on domain criteria
   */
  private shouldCaptureLead(analysis: any, conversation: any): boolean {
    const captureThreshold = this.domainConfig.leadCaptureThreshold || 70;
    const leadScore = this.calculateLeadScore(analysis, conversation);
    
    return leadScore >= captureThreshold && 
           (analysis.leadReadiness === 'ready' || analysis.leadReadiness === 'hot_lead');
  }

  /**
   * Determine next action based on analysis and conversation state
   */
  private determineNextAction(analysis: any, conversation: any, businessResult?: any): string {
    // If we have business results, focus on conversion
    if (businessResult) {
      if (analysis.leadReadiness === 'ready' || analysis.leadReadiness === 'hot_lead') {
        return 'close_sale';
      }
      return 'present_business_result';
    }

    // Standard flow based on intent and conversation stage
    switch (analysis.primaryIntent) {
      case 'PRICE_INQUIRY':
        return 'provide_pricing';
      case 'COMPARISON_REQUEST':
        return 'provide_comparison';
      case 'READY_TO_BUY':
        return 'initiate_purchase';
      case 'OBJECTION':
        return 'handle_objection';
      case 'TECHNICAL_QUESTION':
        return 'provide_technical_info';
      case 'STYLE_QUESTION':
        return 'provide_style_advice';
      default:
        // Use domain-specific stage flow
        const stageFlow = this.domainConfig.stageFlow[conversation.context.stage];
        if (stageFlow && stageFlow[analysis.primaryIntent]) {
          return stageFlow[analysis.primaryIntent];
        }
        return 'continue_conversation';
    }
  }

  /**
   * Calculate lead score based on domain-specific criteria
   */
  
  /** private calculateLeadScore(analysis: any, conversation: any): number {
    const scoreWeights = this.domainConfig.leadScoringWeights || {};
    let score = conversation.leadScore || 0;

    // Apply domain-specific scoring logic
    Object.entries(scoreWeights).forEach(([factor, weight]) => {
      if (analysis[factor]) {
        score += (weight as number);
      }
    });

    return Math.min(100, Math.max(0, score));
  } *

  /**
   * Determine if lead should be captured based on domain criteria
   */

  /*
  private shouldCaptureLead(analysis: any, conversation: any): boolean {
    const captureThreshold = this.domainConfig.leadCaptureThreshold || 70;
    return conversation.leadScore >= captureThreshold && analysis.leadReadiness === 'high';
  }  */

  /**
   * Generate business logic response (e.g., for quotes, calculations, recommendations)
   */
  private async generateBusinessLogicResponse(
    message: string,
    conversation: any,
    businessResult: any,
    analysis: any
  ): Promise<AIResponse> {
    const conversationHistory = conversation.messages.slice(-4)
      .map((msg: any) => `${msg.role}: ${msg.content.substring(0, 100)}...`)
      .join('\n');

    const prompt = `
You are a ${this.domainConfig.domain} specialist providing business results to a customer.

CUSTOMER MESSAGE: "${message}"

BUSINESS RESULT:
${JSON.stringify(businessResult, null, 2)}

CUSTOMER ANALYSIS:
- Intent: ${analysis.primaryIntent}
- Entity Interest: ${analysis.entityType}
- Emotional State: ${analysis.emotionalState}
- Urgency Level: ${analysis.urgencyLevel}
- Lead Readiness: ${analysis.leadReadiness}

RECENT CONVERSATION:
${conversationHistory}

DOMAIN-SPECIFIC GUIDELINES:
${this.domainConfig.responseInstructions}

Create a professional, engaging response that:
1. Acknowledges their specific request
2. Presents the business result clearly and attractively
3. Explains the value and benefits
4. Addresses their emotional state and concerns
5. Provides clear, actionable next steps
6. Uses appropriate ${this.domainConfig.domain} terminology
7. Builds trust and confidence

${this.domainConfig.domain === 'insurance' ? `
For insurance results:
- Present amounts in Ghana Cedis (GH₵) format
- Explain coverage benefits clearly
- Mention policy terms and validity
- Reference local advantages and context
- Use encouraging language
` : this.domainConfig.domain === 'electronics' ? `
For electronics results:
- Highlight key specifications and features
- Compare value propositions
- Mention warranty and support
- Include compatibility information
- Suggest complementary products
` : `
For ${this.domainConfig.domain} results:
- Focus on value and benefits
- Explain features clearly
- Provide comparison context
- Suggest next steps
`}

Generate a response that moves the customer toward a purchase decision.
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

      const responseText = response.choices[0].message.content || '';
      
      // Generate recommendations based on the business result
      const recommendations = this.generateBusinessRecommendations(businessResult, analysis);
      
      return {
        message: responseText,
        confidence: 0.9, // High confidence for business logic results
        leadScore: this.calculateLeadScore(analysis, conversation),
        shouldCaptureLead: this.shouldCaptureLead(analysis, conversation),
        nextAction: this.determineNextAction(analysis, conversation, businessResult),
        context: conversation.context
      };

    } catch (error) {
      console.error('❌ Business logic response generation error:', error);
      
      // Fallback response
      const fallbackMessage = this.generateBusinessFallbackResponse(businessResult);
      
      return {
        message: fallbackMessage,
        confidence: 0.6,
        leadScore: this.calculateLeadScore(analysis, conversation),
        shouldCaptureLead: false,
        nextAction: 'continue_conversation',
        context: conversation.context
      };
    }
  }

  /**
   * Generate business-specific recommendations
   */
  private generateBusinessRecommendations(businessResult: any, analysis: any): Recommendation[] {
    const recommendations: Recommendation[] = [
      { type: 'business_result', data: businessResult }
    ];

    // Domain-specific recommendations
    switch (this.domainConfig.domain) {
      case 'insurance':
        if (businessResult.premium) {
          recommendations.push({
            type: 'action',
            action: 'present_policy_details',
            priority: 'high'
          });

          if (analysis.budgetSignals?.includes('budget_conscious')) {
            recommendations.push({
              type: 'action',
              action: 'offer_payment_plans',
              priority: 'medium'
            });
          }
        }
        break;

      case 'electronics':
        if (businessResult.recommendations) {
          recommendations.push({
            type: 'action',
            action: 'show_product_details',
            priority: 'high'
          });

          recommendations.push({
            type: 'action',
            action: 'suggest_accessories',
            priority: 'medium'
          });
        }
        break;

      case 'fashion':
        if (businessResult.outfits || businessResult.recommendations) {
          recommendations.push({
            type: 'action',
            action: 'show_styling_options',
            priority: 'high'
          });

          if (businessResult.size_consultation) {
            recommendations.push({
              type: 'action',
              action: 'provide_size_guidance',
              priority: 'medium'
            });
          }
        }
        break;
    }

    // Universal recommendations based on analysis
    if (analysis.leadReadiness === 'ready' || analysis.leadReadiness === 'hot_lead') {
      recommendations.push({
        type: 'action',
        action: 'initiate_purchase_process',
        priority: 'urgent'
      });
    }

    if (analysis.urgencyLevel === 'high') {
      recommendations.push({
        type: 'action',
        action: 'emphasize_immediate_benefits',
        priority: 'high'
      });
    }

    return recommendations;
  }

  /**
   * Generate follow-up questions based on analysis and domain
   */
  private generateFollowUpQuestions(analysis: any, conversation: any): string[] {
    const questions: string[] = [];

    // Domain-specific follow-up questions
    switch (this.domainConfig.domain) {
      case 'insurance':
        if (analysis.primaryIntent === 'INFORMATION') {
          questions.push('What type of coverage are you most interested in?');
          questions.push('Do you have any existing insurance policies?');
        }
        if (analysis.primaryIntent === 'PRICE_INQUIRY') {
          questions.push('Would you like me to calculate a personalized quote?');
          questions.push('What coverage amount are you considering?');
        }
        break;

      case 'electronics':
        if (analysis.primaryIntent === 'PRODUCT_INQUIRY') {
          questions.push('What will you primarily use this device for?');
          questions.push('Do you have a preferred brand or budget range?');
        }
        if (analysis.primaryIntent === 'COMPARISON_REQUEST') {
          questions.push('Which specific features matter most to you?');
          questions.push('Would you like to see detailed specifications?');
        }
        break;

      case 'fashion':
        if (analysis.primaryIntent === 'STYLE_QUESTION') {
          questions.push('What occasion are you shopping for?');
          questions.push('Do you have a preferred style or color palette?');
        }
        if (analysis.primaryIntent === 'PRODUCT_INQUIRY') {
          questions.push('What size do you typically wear?');
          questions.push('Are you looking for something specific?');
        }
        break;
    }

    // Universal follow-up questions based on conversation stage
    const messageCount = Math.floor(conversation.messages.length / 2);
    if (messageCount < 2) {
      questions.push('Is there anything specific I can help you with today?');
    }

    if (analysis.leadReadiness === 'exploring') {
      questions.push('Would you like me to show you some options?');
    }

    return questions.slice(0, 2); // Limit to 2 questions to avoid overwhelming
  }

  /**
   * Generate fallback response for business logic when AI fails
   */
  private generateBusinessFallbackResponse(businessResult: any): string {
    switch (this.domainConfig.domain) {
      case 'insurance':
        if (businessResult.premium) {
          return `Great! I've calculated your insurance premium at GH₵${businessResult.premium}${businessResult.validity ? ` with ${businessResult.validity} validity` : ''}. This comprehensive coverage is designed to protect you and your assets. Would you like me to explain what's included or help you proceed with the application?`;
        }
        break;

      case 'electronics':
        if (businessResult.recommendations) {
          const productCount = businessResult.recommendations.length;
          return `Perfect! I've found ${productCount} great ${this.domainConfig.domain} options that match your requirements. These products offer excellent value and performance for your needs. Would you like me to walk you through the features or help you make a decision?`;
        }
        break;

      case 'fashion':
        if (businessResult.outfits) {
          return `Wonderful! I've put together some stylish outfit combinations that would look amazing on you. These pieces work perfectly for your style preferences and the occasion you mentioned. Would you like to see the complete looks or get sizing information?`;
        }
        break;
    }

    // Generic fallback
    return `Excellent! I've prepared some personalized recommendations based on your requirements. Here's what I found: ${JSON.stringify(businessResult)}. Would you like me to explain any of these options in detail or help you move forward?`;
  }

  /**
   * Get default analysis when AI analysis fails
   */
  private getDefaultAnalysis(message: string, context: GenericContext): any {
    return {
      primaryIntent: 'INFORMATION',
      entityType: 'general',
      urgencyLevel: 'medium',
      emotionalState: 'neutral',
      requiresBusinessLogic: false,
      requiresDatabaseQuery: false,
      leadReadiness: 'exploring',
      nextBestAction: 'provide_info',
      confidence: 0.5
    };
  }

  /**
   * Handle errors gracefully
   */
  private handleError(error: any, message: string, userId: string): AIResponse {
    const fallbackResponse = this.domainConfig.fallbackMessage || 
      'I apologize, but I encountered an error. Please try again.';

    return {
      message: fallbackResponse,
      confidence: 0.1,
      leadScore: 0,
      shouldCaptureLead: false,
      nextAction: 'error_recovery',
      context: this.conversations.get(userId)?.context || this.createNewConversation(userId).context
    };
  }
}

export default GenericAIService;