// Enhanced AI Service V2 - Premium Calculation Integration
// File: backend/src/services/EnhancedAIService.ts

import OpenAI from 'openai';
import EnhancedVectorStore from './EnhancedVectorStore';
import { LeadService } from './LeadService';

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
}

interface ConversationHistory {
  userId: string;
  messages: ConversationMessage[];
  context: ConversationContext;
  leadScore: number;
  lastUpdated: Date;
}

interface ConversationContext {
  stage: 'greeting' | 'discovery' | 'presentation' | 'objection_handling' | 'closing' | 'premium_calculation';
  productType?: 'auto' | 'health' | 'life' | 'business';
  customerInfo: {
    name?: string;
    age?: number;
    location?: string;
    budget?: string;
    urgency?: 'high' | 'medium' | 'low';
    [key: string]: any; // For premium calculation parameters
  };
  premiumCalculationState?: {
    isActive: boolean;
    insuranceType?: string;
    collectedParams: { [key: string]: any };
    missingParams: string[];
    canCalculate: boolean;
  };
  leadQualified: boolean;
  sentiment: 'positive' | 'neutral' | 'negative';
  objections: string[];
}

interface AIResponse {
  message: string;
  confidence: number;
  leadScore: number;
  shouldCaptureLead: boolean;
  nextAction: string;
  context: ConversationContext;
  premiumQuote?: {
    amount: number;
    breakdown: any;
    validity: string;
  };
  followUpQuestions?: string[];
}

export class EnhancedAIService {
  private openai: OpenAI;
  private vectorStore: EnhancedVectorStore;
  private leadService: LeadService;
  private conversations: Map<string, ConversationHistory> = new Map();

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || ''
    });
    this.vectorStore = new EnhancedVectorStore();
    this.leadService = new LeadService();
  }

  /**
   * Initialize the enhanced AI service
   */
  async initialize(): Promise<void> {
    console.log('🤖 Initializing Enhanced AI Service V2...');
    await this.vectorStore.initialize();
    console.log('✅ Enhanced AI Service ready with premium calculation capabilities');
  }

  /**
   * Process user message with premium calculation support
   */
  async processMessage(userId: string, message: string): Promise<AIResponse> {
    try {
      // Get or create conversation history
      let conversation = this.conversations.get(userId) || this.createNewConversation(userId);

      // Add user message to history
      conversation.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date()
      });

      // Analyze user intent and message
      const messageAnalysis = await this.analyzeMessage(message, conversation.context);

      // Update conversation context based on analysis
      conversation.context = this.updateContext(conversation.context, messageAnalysis, message);

      // Check if this is a premium calculation request
      if (messageAnalysis.isPremiumCalculationRequest) {
        return await this.handlePremiumCalculation(userId, message, conversation);
      }

      // Query knowledge base with enhanced context
      const ragResult = await this.vectorStore.queryKnowledge(message, {
        productType: conversation.context.productType,
        stage: conversation.context.stage,
        customerInfo: conversation.context.customerInfo,
        conversationHistory: conversation.messages.slice(-3) // Last 3 messages for context
      });

      // Generate response using RAG context
      const response = await this.generateResponse(message, conversation, ragResult);

      // Update conversation with assistant response
      conversation.messages.push({
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
        metadata: { confidence: response.confidence, leadScore: response.leadScore }
      });

      // Update lead score
      conversation.leadScore = response.leadScore;
      conversation.lastUpdated = new Date();

      // Store updated conversation
      this.conversations.set(userId, conversation);

      // Capture lead if qualified
      if (response.shouldCaptureLead) {
        await this.leadService.captureLead({
          userId,
          contactInfo: conversation.context.customerInfo,
          source: 'chat',
          productInterest: conversation.context.productType || 'general',
          score: response.leadScore,
          conversationContext: conversation.context
        });
      }

      return response;

    } catch (error) {
      console.error('❌ Error processing message:', error);
      return {
        message: 'I apologize, but I encountered an error. Please try again or contact our support team.',
        confidence: 0.1,
        leadScore: 0,
        shouldCaptureLead: false,
        nextAction: 'error_recovery',
        context: this.conversations.get(userId)?.context || this.createNewConversation(userId).context
      };
    }
  }

  /**
   * Handle premium calculation requests
   */
  private async handlePremiumCalculation(
    userId: string, 
    message: string, 
    conversation: ConversationHistory
  ): Promise<AIResponse> {
    
    // Initialize premium calculation state if not exists
    if (!conversation.context.premiumCalculationState) {
      conversation.context.premiumCalculationState = {
        isActive: true,
        collectedParams: {},
        missingParams: [],
        canCalculate: false
      };
    }

    const calcState = conversation.context.premiumCalculationState;

    // Detect insurance type if not set
    if (!calcState.insuranceType) {
      const detectedType = this.detectInsuranceType(message, conversation.context);
      if (detectedType !== 'unknown') {
        calcState.insuranceType = detectedType;
        conversation.context.productType = detectedType as any;
      }
    }

    // Extract parameters from current message
    const extractedParams = await this.extractPremiumParameters(message, calcState.insuranceType);
    
    // Merge with existing parameters
    calcState.collectedParams = { ...calcState.collectedParams, ...extractedParams };

    // Get required parameters for this insurance type
    const requiredParams = this.getRequiredParameters(calcState.insuranceType);
    calcState.missingParams = requiredParams.filter(param => 
      !calcState.collectedParams[param] || calcState.collectedParams[param] === ''
    );

    calcState.canCalculate = calcState.missingParams.length === 0;

    // If we can calculate, do it
    if (calcState.canCalculate && calcState.insuranceType) {
      const calculationResult = await this.vectorStore.calculatePremium(
        calcState.insuranceType,
        calcState.collectedParams
      );

      if (calculationResult.success) {
        const responseMessage = this.generatePremiumResponseMessage(
          calculationResult,
          calcState.insuranceType,
          calcState.collectedParams
        );

        return {
          message: responseMessage,
          confidence: 0.95,
          leadScore: 9.0, // High score for completed calculation
          shouldCaptureLead: true,
          nextAction: 'premium_presented',
          context: { ...conversation.context, stage: 'closing' },
          premiumQuote: {
            amount: calculationResult.premium!,
            breakdown: calculationResult.breakdown,
            validity: '30 days'
          },
          followUpQuestions: [
            'Would you like to proceed with this coverage?',
            'Do you have any questions about the premium breakdown?',
            'Would you like to explore different coverage options?'
          ]
        };
      }
    }

    // If we can't calculate yet, ask for missing information
    const responseMessage = this.generateParameterCollectionMessage(
      calcState.insuranceType,
      calcState.missingParams,
      calcState.collectedParams
    );

    return {
      message: responseMessage,
      confidence: 0.8,
      leadScore: Math.min(conversation.leadScore + 1.0, 8.5),
      shouldCaptureLead: false,
      nextAction: 'collect_premium_parameters',
      context: { ...conversation.context, stage: 'premium_calculation' },
      followUpQuestions: this.generateParameterQuestions(calcState.missingParams[0])
    };
  }

  /**
   * Extract premium calculation parameters from user message
   */
  private async extractPremiumParameters(message: string, insuranceType?: string): Promise<any> {
    const systemPrompt = `Extract insurance premium calculation parameters from the user message.
    
    Insurance Type: ${insuranceType || 'unknown'}
    
    Extract any of these parameters that are mentioned:
    - vehicleValue (number)
    - vehicleAge (number) 
    - driverAge (number)
    - location (string: accra, kumasi, regional, rural)
    - coverageType (comprehensive, third_party)
    - drivingHistory (clean, one_claim, multiple_claims)
    - age (number)
    - planType (basic, standard, premium)
    - familySize (number)
    - smokingStatus (smoker, non_smoker, former_smoker)
    - occupation (string)
    - businessType (string)
    - employeeCount (number)
    - propertyValue (number)
    - annualRevenue (number)
    
    Return only a JSON object with the extracted parameters. If no parameters found, return {}.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.1,
        max_tokens: 200
      });

      const extracted = JSON.parse(response.choices[0].message.content || '{}');
      console.log('📊 Extracted parameters:', extracted);
      return extracted;
    } catch (error) {
      console.error('❌ Failed to extract parameters:', error);
      return {};
    }
  }

  /**
   * Generate response message for premium calculation result
   */
  private generatePremiumResponseMessage(
    calculationResult: any, 
    insuranceType: string, 
    parameters: any
  ): string {
    const { premium, breakdown } = calculationResult;
    
    let message = `🎯 **${insuranceType.toUpperCase()} INSURANCE PREMIUM QUOTE**\n\n`;
    
    message += `**Annual Premium: GH₵ ${premium.toLocaleString()}**\n`;
    message += `**Monthly Premium: GH₵ ${Math.round(premium / 12).toLocaleString()}**\n\n`;
    
    message += `📊 **Premium Breakdown:**\n`;
    if (breakdown.basePremium) {
      message += `• Base Premium: GH₵ ${breakdown.basePremium.toLocaleString()}\n`;
    }
    
    Object.entries(breakdown).forEach(([key, value]) => {
      if (key !== 'basePremium' && key !== 'finalPremium' && typeof value === 'number') {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        if (value < 1) {
          const percentage = Math.round((1 - value) * 100);
          message += `• ${label}: -${percentage}% discount\n`;
        } else if (value > 1) {
          const percentage = Math.round((value - 1) * 100);
          message += `• ${label}: +${percentage}% increase\n`;
        }
      }
    });
    
    message += `\n💡 **What's Included:**\n`;
    switch (insuranceType) {
      case 'auto':
        if (parameters.coverageType === 'comprehensive') {
          message += `• Accident damage coverage\n• Theft protection\n• Third-party liability\n• Roadside assistance\n`;
        } else {
          message += `• Third-party liability coverage\n• Legal compliance\n`;
        }
        break;
      case 'health':
        message += `• Private hospital access\n• Dental and vision care\n• International coverage\n• 24/7 medical helpline\n`;
        break;
    }
    
    message += `\n🎉 **Special Benefits:**\n`;
    message += `• Mobile money payment options (MTN MoMo, Vodafone Cash)\n`;
    message += `• Annual payment discount: -5%\n`;
    message += `• 30-day money-back guarantee\n`;
    message += `• Claims processing via WhatsApp\n\n`;
    
    message += `✨ This quote is valid for 30 days. Ready to secure your coverage?`;
    
    return message;
  }

  /**
   * Generate message for collecting missing parameters
   */
  private generateParameterCollectionMessage(
    insuranceType?: string, 
    missingParams: string[] = [],
    collectedParams: any = {}
  ): string {
    
    if (!insuranceType) {
      return `I'd be happy to calculate a premium quote for you! 🧮\n\nFirst, which type of insurance are you interested in?\n• Auto Insurance\n• Health Insurance\n• Life Insurance\n• Business Insurance`;
    }

    if (missingParams.length === 0) {
      return `Perfect! I have all the information needed to calculate your ${insuranceType} insurance premium. Let me process that for you... 🔄`;
    }

    const nextParam = missingParams[0];
    let message = `Great! I'm calculating your ${insuranceType} insurance premium. 📋\n\n`;
    
    // Show what we have so far
    if (Object.keys(collectedParams).length > 0) {
      message += `✅ **Information collected:**\n`;
      Object.entries(collectedParams).forEach(([key, value]) => {
        const label = this.getParameterLabel(key);
        message += `• ${label}: ${value}\n`;
      });
      message += `\n`;
    }

    // Ask for next parameter
    message += `📝 To complete your quote, I need: **${this.getParameterLabel(nextParam)}**\n\n`;
    message += this.getParameterPrompt(nextParam);
    
    return message;
  }

  /**
   * Get user-friendly label for parameter
   */
  private getParameterLabel(param: string): string {
    const labels: { [key: string]: string } = {
      'vehicleValue': 'Vehicle Value',
      'vehicleAge': 'Vehicle Age',
      'driverAge': 'Your Age',
      'location': 'Location',
      'coverageType': 'Coverage Type',
      'drivingHistory': 'Driving History',
      'age': 'Your Age',
      'planType': 'Plan Type',
      'familySize': 'Family Size',
      'smokingStatus': 'Smoking Status',
      'occupation': 'Occupation',
      'businessType': 'Business Type',
      'employeeCount': 'Number of Employees',
      'propertyValue': 'What is the estimated value of your business property/equipment? (e.g., GH₵ 100,000)',
      'annualRevenue': 'What is your business annual revenue? (e.g., GH₵ 500,000)'
    };
    return labels[param] || `Please provide your ${this.getParameterLabel(param)}`;
  }

  /**
   * Get prompt for specific parameter
   */
  private getParameterPrompt(param: string): string {
    const prompts: { [key: string]: string } = {
      'vehicleValue': 'What is the current market value of your vehicle? (e.g., GH₵ 50,000)',
      'vehicleAge': 'How old is your vehicle? (in years)',
      'driverAge': 'What is your age?',
      'location': 'Where do you primarily drive? (Accra, Kumasi, Regional city, or Rural area)',
      'coverageType': 'Would you like Comprehensive coverage or Third-party only?',
      'drivingHistory': 'How is your driving record? (Clean record, One claim in past 3 years, or Multiple claims)',
      'age': 'What is your age?',
      'planType': 'Which plan interests you? (Basic, Standard, or Premium)',
      'familySize': 'How many family members will be covered? (including yourself)',
      'smokingStatus': 'Do you smoke? (Yes, No, or Former smoker)',
      'occupation': 'What is your occupation?',
      'businessType': 'What type of business do you operate?',
      'employeeCount': 'How many employees does your business have?',
      'propertyValue': 'What is the estimated value of your business property/equipment? (e.g., GH₵ 100,000)',
      'annualRevenue': 'What is your business annual revenue? (e.g., GH₵ 500,000)'
    };
    return prompts[param] || `Please provide your ${this.getParameterLabel(param)}`;
  }

  /**
   * Generate follow-up questions for parameter collection
   */
  private generateParameterQuestions(param: string): string[] {
    const questions: { [key: string]: string[] } = {
      'vehicleValue': [
        'Do you know the current market value?',
        'Would you like help estimating the value?'
      ],
      'location': [
        'Which city or region are you in?',
        'Do you drive mainly in urban or rural areas?'
      ],
      'coverageType': [
        'What level of coverage do you prefer?',
        'Would you like me to explain the coverage options?'
      ],
      'planType': [
        'What\'s your preferred coverage level?',
        'Would you like me to explain the plan differences?'
      ]
    };
    return questions[param] || ['Can you provide this information?'];
  }

  /**
   * Get required parameters for insurance type
   */
  private getRequiredParameters(insuranceType?: string): string[] {
    const requirements: { [key: string]: string[] } = {
      'auto': ['vehicleValue', 'vehicleAge', 'driverAge', 'location', 'coverageType'],
      'health': ['age', 'planType', 'familySize', 'smokingStatus'],
      'life': ['age', 'coverageAmount', 'policyType', 'smokingStatus'],
      'business': ['businessType', 'employeeCount', 'propertyValue']
    };
    return requirements[insuranceType || ''] || [];
  }

  /**
   * Detect insurance type from message
   */
  private detectInsuranceType(message: string, context: ConversationContext): string {
    if (context.productType) return context.productType;
    
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('auto') || lowerMessage.includes('car') || lowerMessage.includes('vehicle')) {
      return 'auto';
    }
    if (lowerMessage.includes('health') || lowerMessage.includes('medical')) {
      return 'health';
    }
    if (lowerMessage.includes('life') || lowerMessage.includes('death')) {
      return 'life';
    }
    if (lowerMessage.includes('business') || lowerMessage.includes('commercial')) {
      return 'business';
    }
    
    return 'unknown';
  }

  /**
   * Analyze user message for intent and content
   */
  private async analyzeMessage(message: string, context: ConversationContext): Promise<any> {
    const systemPrompt = `Analyze this insurance-related message for:
    1. Is this a premium calculation request? (look for words like: quote, cost, price, premium, calculate, how much)
    2. Sentiment (positive, neutral, negative)
    3. Purchase intent (scale 1-10)
    4. Urgency level (high, medium, low)
    5. Any objections mentioned
    6. Information provided (name, age, contact, etc.)
    
    Current conversation stage: ${context.stage}
    Current product type: ${context.productType || 'unknown'}
    
    Return JSON format:
    {
      "isPremiumCalculationRequest": boolean,
      "sentiment": "positive|neutral|negative", 
      "purchaseIntent": number,
      "urgency": "high|medium|low",
      "objections": string[],
      "providedInfo": object,
      "nextSuggestedStage": "greeting|discovery|presentation|objection_handling|premium_calculation|closing"
    }`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.1,
        max_tokens: 300
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      console.error('❌ Failed to analyze message:', error);
      return {
        isPremiumCalculationRequest: false,
        sentiment: 'neutral',
        purchaseIntent: 5,
        urgency: 'medium',
        objections: [],
        providedInfo: {},
        nextSuggestedStage: 'discovery'
      };
    }
  }

  /**
   * Update conversation context based on analysis
   */
  private updateContext(
    currentContext: ConversationContext, 
    analysis: any, 
    message: string
  ): ConversationContext {
    
    const updatedContext = { ...currentContext };
    
    // Update sentiment
    updatedContext.sentiment = analysis.sentiment;
    
    // Update stage based on analysis
    if (analysis.nextSuggestedStage && analysis.nextSuggestedStage !== currentContext.stage) {
      updatedContext.stage = analysis.nextSuggestedStage;
    }
    
    // Update customer info with provided information
    if (analysis.providedInfo) {
      updatedContext.customerInfo = { 
        ...updatedContext.customerInfo, 
        ...analysis.providedInfo 
      };
    }
    
    // Add objections
    if (analysis.objections && analysis.objections.length > 0) {
      updatedContext.objections = [
        ...updatedContext.objections,
        ...analysis.objections
      ];
    }
    
    // Update urgency
    if (analysis.urgency) {
      updatedContext.customerInfo.urgency = analysis.urgency;
    }
    
    return updatedContext;
  }

  /**
   * Generate AI response using RAG context
   */
  private async generateResponse(
    message: string, 
    conversation: ConversationHistory, 
    ragResult: any
  ): Promise<AIResponse> {
    
    const systemPrompt = `You are a professional insurance agent in Ghana specializing in helping customers find the right insurance coverage. 

    CONTEXT INFORMATION:
    ${ragResult.context}

    CONVERSATION STAGE: ${conversation.context.stage}
    CUSTOMER INFO: ${JSON.stringify(conversation.context.customerInfo)}
    PRODUCT INTEREST: ${conversation.context.productType || 'unknown'}
    CONVERSATION HISTORY: ${conversation.messages.slice(-2).map(m => `${m.role}: ${m.content}`).join('\n')}

    GUIDELINES:
    - Be conversational, helpful, and professional
    - Use Ghana-specific context (GH₵ currency, local locations, mobile money)
    - If customer asks about premiums but you need more info, guide them through the calculation process
    - Focus on benefits and value, not just features
    - Address objections with empathy and solutions
    - Keep responses concise but informative
    - Use emojis sparingly and appropriately
    - Always aim to move the conversation forward

    PREMIUM CALCULATION:
    - If customer wants a quote, you can help calculate premiums
    - For auto insurance: need vehicle value, age, driver age, location, coverage type
    - For health insurance: need age, plan type, family size, smoking status
    - Guide them step-by-step to collect this information

    Respond naturally to their message while incorporating relevant information from the context.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const aiMessage = response.choices[0].message.content || '';

      // Calculate lead score based on conversation analysis
      const leadScore = this.calculateLeadScore(conversation, ragResult);

      // Determine if lead should be captured
      const shouldCaptureLead = this.shouldCaptureLead(leadScore, conversation);

      // Determine next action
      const nextAction = this.determineNextAction(conversation.context, leadScore);

      return {
        message: aiMessage,
        confidence: ragResult.confidence || 0.8,
        leadScore,
        shouldCaptureLead,
        nextAction,
        context: conversation.context
      };

    } catch (error) {
      console.error('❌ Failed to generate response:', error);
      throw error;
    }
  }

  /**
   * Calculate lead score based on conversation analysis
   */
  private calculateLeadScore(conversation: ConversationHistory, ragResult: any): number {
    let score = 0;

    // Base score from message count (engagement)
    score += Math.min(conversation.messages.length * 0.5, 3);

    // Product type specified
    if (conversation.context.productType) score += 1;

    // Contact information provided
    const info = conversation.context.customerInfo;
    if (info.name) score += 1;
    if (info.age) score += 0.5;
    if (info.location) score += 0.5;

    // Premium calculation interest
    if (conversation.context.premiumCalculationState?.isActive) score += 2;

    // Sentiment bonus
    if (conversation.context.sentiment === 'positive') score += 1;
    else if (conversation.context.sentiment === 'negative') score -= 1;

    // Urgency bonus
    if (conversation.context.customerInfo.urgency === 'high') score += 1.5;
    else if (conversation.context.customerInfo.urgency === 'medium') score += 0.5;

    // Stage progression bonus
    const stageScores = {
      'greeting': 1,
      'discovery': 3,
      'presentation': 5,
      'premium_calculation': 7,
      'objection_handling': 6,
      'closing': 8
    };
    score += stageScores[conversation.context.stage] || 0;

    return Math.min(Math.max(score, 0), 10);
  }

  /**
   * Determine if lead should be captured
   */
  private shouldCaptureLead(leadScore: number, conversation: ConversationHistory): boolean {
    // Don't capture if already qualified
    if (conversation.context.leadQualified) return false;

    // Higher threshold for new conversations
    const messageCount = conversation.messages.length;
    const threshold = messageCount <= 2 ? 8.0 : 6.5;

    return leadScore >= threshold;
  }

  /**
   * Determine next action based on context
   */
  private determineNextAction(context: ConversationContext, leadScore: number): string {
    if (context.premiumCalculationState?.canCalculate) {
      return 'calculate_premium';
    }
    
    if (context.premiumCalculationState?.isActive) {
      return 'collect_premium_parameters';
    }

    if (leadScore >= 8) {
      return 'closing';
    }

    if (context.objections.length > 0) {
      return 'handle_objections';
    }

    switch (context.stage) {
      case 'greeting': return 'discovery';
      case 'discovery': return 'presentation';
      case 'presentation': return 'premium_calculation';
      case 'premium_calculation': return 'closing';
      default: return 'continue_conversation';
    }
  }

  /**
   * Create new conversation
   */
  private createNewConversation(userId: string): ConversationHistory {
    return {
      userId,
      messages: [],
      context: {
        stage: 'greeting',
        customerInfo: {},
        leadQualified: false,
        sentiment: 'neutral',
        objections: []
      },
      leadScore: 0,
      lastUpdated: new Date()
    };
  }

  /**
   * Get conversation history for a user
   */
  getConversationHistory(userId: string): ConversationHistory | null {
    return this.conversations.get(userId) || null;
  }

  /**
   * Get all active conversations
   */
  getActiveConversations(): ConversationHistory[] {
    return Array.from(this.conversations.values());
  }

  /**
   * Get service statistics
   */
  getServiceStats(): any {
    const conversations = Array.from(this.conversations.values());
    
    return {
      totalConversations: conversations.length,
      averageLeadScore: conversations.reduce((sum, conv) => sum + conv.leadScore, 0) / conversations.length || 0,
      qualifiedLeads: conversations.filter(conv => conv.context.leadQualified).length,
      premiumCalculationsActive: conversations.filter(conv => 
        conv.context.premiumCalculationState?.isActive
      ).length,
      stageDistribution: conversations.reduce((acc, conv) => {
        acc[conv.context.stage] = (acc[conv.context.stage] || 0) + 1;
        return acc;
      }, {} as { [key: string]: number }),
      knowledgeBaseStats: this.vectorStore.getKnowledgeStats()
    };
  }

  /**
   * Clear conversation history (for testing/privacy)
   */
  clearConversation(userId: string): void {
    this.conversations.delete(userId);
  }

  /**
   * Update knowledge base
   */
  async updateKnowledgeBase(documents: any[]): Promise<void> {
    await this.vectorStore.updateKnowledge(documents);
  }
}

export default EnhancedAIService;