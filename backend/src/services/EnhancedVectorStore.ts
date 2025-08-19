// Updated EnhancedVectorStore with Premium Calculation Support
// File: backend/src/services/EnhancedVectorStore.ts

import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { 
  EnhancedRAGDocument,
  ContextualQueryResult,
  EnhancedRAGQueryResult,
  QueryContext,
  EnhancedQueryContext,
  PremiumCalculationService,
  Document,
  convertLegacyToEnhanced,
  convertEnhancedToLegacy,
  isEnhancedRAGDocument,
  SEASONAL_CONTEXTS,
  LOCATION_RISKS
} from '../types/unified-rag';

// Import existing knowledge base with fallback
let enhancedKnowledgeBase: EnhancedRAGDocument[] = [];
try {
  const knowledgeModule = require('../data/enhanced-knowledge-base');
  enhancedKnowledgeBase = knowledgeModule.enhancedKnowledgeBase || [];
  console.log('📚 Loaded existing enhanced knowledge base');
} catch (error) {
  console.log('📝 Enhanced knowledge base not found, will create sample knowledge');
}

interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: EnhancedRAGDocument['metadata'];
  performance?: {
    queryCount: number;
    averageRelevance: number;
    lastUsed: Date;
    effectiveness: number; // 0-1
  };
}

interface SearchFilter {
  productTypes?: string[];
  customerSegments?: string[];
  urgencyLevels?: string[];
  seasonalContext?: string[];
  locationRelevance?: string[];
  conversationStage?: string[];
  minEffectiveness?: number;
  calculationCapability?: boolean;
}

export class EnhancedVectorStore {
  private openai: OpenAI | null = null;
  private documents: VectorDocument[] = [];
  private queryCache: Map<string, ContextualQueryResult> = new Map();
  private initialized = false;
  private companyId: string;
  private dataPath: string;
  private mode: 'enhanced' | 'legacy' = 'enhanced';

  constructor(companyId: string = 'default') {
    this.companyId = companyId;
    this.dataPath = path.join(process.cwd(), 'data', `enhanced_vector_${companyId}.json`);
  }

  private initializeOpenAI(): void {
    if (!this.openai) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }

  /**
   * Initialize the enhanced vector store with premium calculation support
   */
  async initialize(): Promise<void> {
    console.log(`🚀 Initializing Enhanced Vector Store V2 for company ${this.companyId}`);
    
    this.initializeOpenAI();
    
    try {
      await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
      
      // Try to load existing data
      try {
        const data = await fs.readFile(this.dataPath, 'utf-8');
        const parsed = JSON.parse(data);
        
        if (parsed.documents && Array.isArray(parsed.documents)) {
          this.documents = parsed.documents.map((doc: any) => ({
            ...doc,
            performance: doc.performance || {
              queryCount: 0,
              averageRelevance: 0.5,
              lastUsed: new Date(),
              effectiveness: 0.7
            }
          }));
          console.log(`📚 Loaded ${this.documents.length} existing documents`);
        } else {
          throw new Error('Invalid data format');
        }
      } catch {
        console.log('📖 No existing data found, loading knowledge base...');
        await this.loadKnowledgeBase();
      }
      
      this.initialized = true;
      console.log('✅ Enhanced Vector Store initialized successfully');
      console.log(`📊 Knowledge base ready: ${this.documents.length} documents with premium calculation support`);
      
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced Vector Store:', error);
      throw error;
    }
  }

  /**
   * Query knowledge base with enhanced or legacy context
   */
  async queryKnowledge(
    query: string, 
    context: QueryContext | EnhancedQueryContext
  ): Promise<ContextualQueryResult | EnhancedRAGQueryResult> {
    if (!this.initialized) await this.initialize();

    try {
      console.log(`🔍 Querying knowledge base: "${query.substring(0, 50)}..."`);
      
      // Determine if this is enhanced context or legacy
      const isEnhancedContext = this.isEnhancedQueryContext(context);
      
      if (isEnhancedContext) {
        return await this.queryWithEnhancedContext(query, context as EnhancedQueryContext);
      } else {
        return await this.queryWithLegacyContext(query, context as QueryContext);
      }
      
    } catch (error) {
      console.error('❌ Error querying knowledge base:', error);
      return this.createFallbackResult(query);
    }
  }

  /**
   * Query with enhanced context (new system)
   */
  private async queryWithEnhancedContext(
    query: string,
    context: EnhancedQueryContext
  ): Promise<ContextualQueryResult> {
    
    const startTime = Date.now();
    
    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Build search filters from enhanced context
      const filters = this.buildEnhancedFilters(context);
      
      // Perform vector search with filtering
      const candidateDocuments = await this.performVectorSearch(queryEmbedding, filters);
      
      // Re-rank based on enhanced context
      const reRankedDocuments = this.reRankByEnhancedContext(candidateDocuments, context);
      
      // Build result
      const result = this.buildEnhancedResult(reRankedDocuments, context, query);
      
      const processingTime = Date.now() - startTime;
      console.log(`✅ Enhanced query completed in ${processingTime}ms with ${result.documents.length} results`);
      
      return result;
      
    } catch (error) {
      console.error('Enhanced query failed:', error);
      throw error;
    }
  }

  /**
   * Query with legacy context (backward compatibility)
   */
  private async queryWithLegacyContext(
    query: string,
    context: QueryContext
  ): Promise<EnhancedRAGQueryResult> {
    
    try {
      console.log('📝 Processing legacy query context');
      
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Build legacy filters
      const filters = this.buildLegacyFilters(context);
      
      // Perform basic vector search
      const candidateDocuments = await this.performVectorSearch(queryEmbedding, filters);
      
      // Re-rank based on legacy context
      const reRankedDocuments = this.reRankByLegacyContext(candidateDocuments, context);
      
      // Build legacy-compatible result
      const result = this.buildLegacyResult(reRankedDocuments, context, query);
      
      console.log(`✅ Legacy query completed with ${result.documents.length} results`);
      
      return result;
      
    } catch (error) {
      console.error('Legacy query failed:', error);
      throw error;
    }
  }

  /**
   * Calculate premium using integrated calculation service
   */
  async calculatePremium(
    insuranceType: string, 
    parameters: any
  ): Promise<{ success: boolean; premium?: number; breakdown?: any; error?: string }> {
    
    try {
      console.log(`💰 Calculating ${insuranceType} premium with parameters:`, Object.keys(parameters));
      
      // Validate parameters first
      const validation = this.validatePremiumParameters(insuranceType, parameters);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }
      
      // Calculate using PremiumCalculationService
      let result;
      
      switch (insuranceType.toLowerCase()) {
        case 'auto':
          result = PremiumCalculationService.calculateAutoPremium({
            vehicleValue: parameters.vehicleValue || parameters.vehicle_value,
            vehicleAge: parameters.vehicleAge || parameters.vehicle_age || 5,
            driverAge: parameters.driverAge || parameters.driver_age || parameters.age,
            location: parameters.location || 'accra',
            coverageType: parameters.coverageType || parameters.coverage_type || 'comprehensive',
            drivingHistory: parameters.drivingHistory || parameters.driving_history || 'clean',
            securityFeatures: parameters.securityFeatures || parameters.security_features || []
          });
          break;
          
        case 'health':
          result = PremiumCalculationService.calculateHealthPremium({
            age: parameters.age || 30,
            planType: parameters.planType || parameters.plan_type || 'standard',
            familySize: parameters.familySize || parameters.family_size || 1,
            preExistingConditions: parameters.preExistingConditions || parameters.conditions || [],
            smokingStatus: parameters.smokingStatus || parameters.smoking_status || 'non_smoker',
            occupation: parameters.occupation || 'general'
          });
          break;
          
        case 'life':
          // Basic life insurance calculation
          const age = parameters.age || 30;
          const coverage = parameters.coverage || parameters.coverageAmount || 500000;
          const ratePerThousand = age < 35 ? 3.5 : age < 45 ? 8.5 : age < 55 ? 18.5 : 37.5;
          const annualPremium = (coverage / 1000) * ratePerThousand;
          
          result = {
            premium: Math.round(annualPremium),
            breakdown: {
              baseCoverage: coverage,
              ageRate: ratePerThousand,
              annualPremium: Math.round(annualPremium),
              monthlyPremium: Math.round(annualPremium / 12)
            }
          };
          break;
          
        default:
          return {
            success: false,
            error: `Unsupported insurance type: ${insuranceType}`
          };
      }
      
      console.log(`💰 Premium calculated: GH₵ ${result.premium}`);
      
      return {
        success: true,
        premium: result.premium,
        breakdown: result.breakdown
      };
      
    } catch (error) {
      console.error('Premium calculation error:', error);
      return {
        success: false,
        error: 'Premium calculation failed due to system error'
      };
    }
  }

  /**
   * Update knowledge base with new documents
   */
  async updateKnowledge(newDocuments: (EnhancedRAGDocument | Document)[]): Promise<void> {
    if (!this.initialized) await this.initialize();
    
    console.log(`🔄 Updating knowledge base with ${newDocuments.length} documents...`);
    
    for (const doc of newDocuments) {
      // Convert legacy documents to enhanced format if needed
      const enhancedDoc = isEnhancedRAGDocument(doc) ? doc : convertLegacyToEnhanced(doc);
      
      await this.addDocument(enhancedDoc);
    }
    
    await this.saveToFile();
    console.log(`✅ Knowledge base updated successfully`);
  }

  /**
   * Add single document to vector store
   */
  async addDocument(document: EnhancedRAGDocument): Promise<void> {
    if (!this.initialized) await this.initialize();
    
    const embedding = await this.generateEmbedding(document.content);
    
    const vectorDoc: VectorDocument = {
      id: document.id,
      content: document.content,
      embedding,
      metadata: document.metadata,
      performance: {
        queryCount: 0,
        averageRelevance: 0.5,
        lastUsed: new Date(),
        effectiveness: document.metadata.effectiveness || 0.7
      }
    };
    
    // Remove existing document with same ID
    this.documents = this.documents.filter(d => d.id !== document.id);
    
    // Add new document
    this.documents.push(vectorDoc);
    
    // Clear cache
    this.queryCache.clear();
    
    console.log(`📄 Added/updated document: ${document.id}`);
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI not initialized');
    }
    
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
        encoding_format: 'float'
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  /**
   * Build enhanced filters from context
   */
  private buildEnhancedFilters(context: EnhancedQueryContext): SearchFilter {
    return {
      productTypes: [context.product.primaryFocus, ...context.product.secondaryInterests],
      customerSegments: [this.determineCustomerSegment(context.customer)],
      urgencyLevels: [context.product.urgencyLevel],
      seasonalContext: [context.market.season],
      locationRelevance: [context.customer.location, 'ghana'],
      conversationStage: [context.conversation.stage],
      minEffectiveness: 0.3
    };
  }

  /**
   * Build legacy filters from context
   */
  private buildLegacyFilters(context: QueryContext): SearchFilter {
    const filters: SearchFilter = {};
    
    if (context.productType) {
      filters.productTypes = [context.productType];
    }
    
    if (context.stage) {
      filters.conversationStage = [context.stage];
    }
    
    // Default minimum effectiveness
    filters.minEffectiveness = 0.2;
    
    return filters;
  }

  /**
   * Perform vector search with filtering
   */
  private async performVectorSearch(
    queryEmbedding: number[], 
    filters: SearchFilter
  ): Promise<Array<{document: VectorDocument, similarity: number}>> {
    
    // Filter documents based on metadata
    const filteredDocuments = this.documents.filter(doc => this.matchesFilters(doc, filters));
    
    console.log(`🔽 Filtered from ${this.documents.length} to ${filteredDocuments.length} documents`);

    // Calculate similarities
    const similarities = filteredDocuments.map(doc => ({
      document: doc,
      similarity: this.cosineSimilarity(queryEmbedding, doc.embedding)
    }));

    // Sort by similarity and take top candidates
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // Return top 10 candidates for re-ranking
    return similarities.slice(0, 10).filter(result => result.similarity > 0.2);
  }

  /**
   * Re-rank documents based on enhanced context
   */
  private reRankByEnhancedContext(
    candidates: Array<{document: VectorDocument, similarity: number}>,
    context: EnhancedQueryContext
  ): Array<{document: VectorDocument, score: number}> {

    return candidates.map(candidate => {
      let score = candidate.similarity * 0.6; // Base similarity weight
      
      // Customer match bonus
      const customerMatch = this.calculateCustomerMatch(candidate.document, context);
      score += customerMatch * 0.2;
      
      // Urgency match bonus
      const urgencyMatch = this.calculateUrgencyMatch(candidate.document, context);
      score += urgencyMatch * 0.1;
      
      // Seasonal relevance bonus
      const seasonalMatch = this.calculateSeasonalMatch(candidate.document, context);
      score += seasonalMatch * 0.05;
      
      // Effectiveness bonus
      const effectiveness = candidate.document.performance?.effectiveness || 0.5;
      score += effectiveness * 0.05;

      return {
        document: candidate.document,
        score: Math.min(score, 1.0)
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Re-rank documents based on legacy context
   */
  private reRankByLegacyContext(
    candidates: Array<{document: VectorDocument, similarity: number}>,
    context: QueryContext
  ): Array<{document: VectorDocument, score: number}> {

    return candidates.map(candidate => {
      let score = candidate.similarity * 0.8; // Higher weight on similarity for legacy
      
      // Product type match
      if (context.productType && 
          candidate.document.metadata.productTypes?.includes(context.productType)) {
        score += 0.1;
      }
      
      // Stage match
      if (context.stage && 
          candidate.document.metadata.conversationStage?.includes(context.stage)) {
        score += 0.1;
      }

      return {
        document: candidate.document,
        score: Math.min(score, 1.0)
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Build enhanced result
   */
  private buildEnhancedResult(
    rankedDocuments: Array<{document: VectorDocument, score: number}>,
    context: EnhancedQueryContext,
    query: string
  ): ContextualQueryResult {
    
    // Take top 5 documents
    const topDocuments = rankedDocuments.slice(0, 5);
    
    // Convert to EnhancedRAGDocument format
    const documents: EnhancedRAGDocument[] = topDocuments.map(item => ({
      id: item.document.id,
      content: item.document.content,
      metadata: item.document.metadata
    }));

    // Build context string
    const contextString = documents.map(doc => doc.content).join('\n\n---\n\n');

    // Calculate confidence and relevance
    const confidence = this.calculateConfidence(topDocuments);
    const relevanceScore = topDocuments.length > 0 
      ? topDocuments.reduce((sum, item) => sum + item.score, 0) / topDocuments.length
      : 0;

    // Extract metadata insights
    const metadata = this.extractMetadataInsights(documents);

    // Calculate contextual factors
    const contextualFactors = {
      customerMatch: this.calculateAverageCustomerMatch(topDocuments, context),
      situationalRelevance: this.calculateAverageSituationalRelevance(topDocuments, context),
      marketAlignment: this.calculateAverageMarketAlignment(topDocuments, context),
      urgencyMatch: this.calculateAverageUrgencyMatch(topDocuments, context)
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations(documents, context);

    // Check for premium calculation capability
    const premiumCalculation = this.assessPremiumCalculationCapability(documents, query);

    return {
      documents,
      context: contextString,
      confidence,
      relevanceScore,
      metadata,
      contextualFactors,
      recommendations,
      premiumCalculation
    };
  }

  /**
   * Build legacy result
   */
  private buildLegacyResult(
    rankedDocuments: Array<{document: VectorDocument, score: number}>,
    context: QueryContext,
    query: string
  ): EnhancedRAGQueryResult {
    
    // Take top 5 documents
    const topDocuments = rankedDocuments.slice(0, 5);
    
    // Convert to EnhancedRAGDocument format
    const documents: EnhancedRAGDocument[] = topDocuments.map(item => ({
      id: item.document.id,
      content: item.document.content,
      metadata: item.document.metadata
    }));

    // Build context string
    const contextString = documents.map(doc => doc.content).join('\n\n---\n\n');

    // Calculate basic metrics
    const confidence = this.calculateConfidence(topDocuments);
    const relevanceScore = topDocuments.length > 0 
      ? topDocuments.reduce((sum, item) => sum + item.score, 0) / topDocuments.length
      : 0;

    // Basic metadata
    const metadata = this.extractBasicMetadata(documents);

    // Basic contextual factors
    const contextualFactors = {
      customerMatch: 0.5,
      situationalRelevance: 0.5,
      marketAlignment: 0.5,
      urgencyMatch: 0.5
    };

    // Basic recommendations
    const recommendations = {
      nextBestActions: ['continue_conversation'],
      followUpQuestions: ['How can I help you further?'],
      additionalInfo: []
    };

    // Check for premium calculation capability
    const premiumCalculation = this.assessPremiumCalculationCapability(documents, query);

    return {
      documents,
      context: contextString,
      confidence,
      relevanceScore,
      metadata,
      contextualFactors,
      recommendations,
      premiumCalculation
    };
  }

  /**
   * Create fallback result for errors
   */
  private createFallbackResult(query: string): ContextualQueryResult {
    return {
      documents: [],
      context: `I apologize, but I encountered an issue processing your query: "${query}". I'm still here to help with your insurance needs!`,
      confidence: 0.2,
      relevanceScore: 0.2,
      metadata: {
        hasProductInfo: false,
        hasObjectionHandling: false,
        hasMarketContext: false,
        hasPremiumCalculation: false,
        hasRiskFactors: false,
        hasClaimsInfo: false,
        hasLocalRelevance: false,
        seasonalRelevance: false
      },
      contextualFactors: {
        customerMatch: 0.2,
        situationalRelevance: 0.2,
        marketAlignment: 0.2,
        urgencyMatch: 0.2
      },
      recommendations: {
        nextBestActions: ['gather_basic_info'],
        followUpQuestions: ['What type of insurance are you interested in?'],
        additionalInfo: []
      }
    };
  }

  /**
   * Load knowledge base from existing or create sample
   */
  private async loadKnowledgeBase(): Promise<void> {
    console.log('🔄 Loading knowledge base...');
    
    if (enhancedKnowledgeBase.length > 0) {
      console.log(`📚 Using existing enhanced knowledge base: ${enhancedKnowledgeBase.length} documents`);
      
      for (const doc of enhancedKnowledgeBase) {
        await this.addDocument(doc);
      }
    } else {
      console.log('📖 Creating sample knowledge base...');
      await this.createSampleKnowledgeBase();
    }
    
    await this.saveToFile();
    console.log(`💾 Knowledge base loaded with ${this.documents.length} documents`);
  }

  /**
   * Create sample knowledge base if none exists
   */
  private async createSampleKnowledgeBase(): Promise<void> {
    const sampleDocuments: EnhancedRAGDocument[] = [
      {
        id: 'auto_comprehensive_basic',
        content: `Comprehensive auto insurance in Ghana covers accident damage, theft, third-party liability, and windshield replacement. Starting from GH₵ 300/month for sedans. Popular with families and professionals. Covers both your vehicle and damages to others.`,
        metadata: {
          type: 'product',
          category: 'auto_insurance',
          subcategory: 'comprehensive',
          priority: 'high',
          productTypes: ['auto'],
          customerSegments: ['young_professional', 'family_oriented'],
          seasonalRelevance: ['harmattan', 'rainy', 'dry'],
          locationRelevance: ['accra', 'kumasi', 'ghana'],
          urgencyLevel: ['medium', 'high'],
          conversationStage: ['discovery', 'presentation'],
          lastUpdated: new Date(),
          effectiveness: 0.8,
          tags: ['popular', 'comprehensive'],
          companyId: this.companyId,
          version: '2.0'
        }
      },
      {
        id: 'premium_calculation_auto_basic',
        content: `Auto insurance premium calculation: Based on vehicle value (4% for comprehensive), driver age, location, and driving history. Accra residents pay 20% more. Young drivers under 25 pay 40% extra. Clean driving record gets 15% discount.`,
        metadata: {
          type: 'premium_calculation',
          category: 'auto',
          priority: 'high',
          productTypes: ['auto'],
          customerSegments: ['young_professional', 'family_oriented'],
          conversationStage: ['premium_calculation'],
          lastUpdated: new Date(),
          effectiveness: 0.9,
          tags: ['calculation', 'pricing'],
          companyId: this.companyId,
          version: '2.0',
          calculationRules: [
            {
              factor: 'vehicle_value',
              multiplier: 0.04,
              condition: 'comprehensive_coverage',
              description: 'Premium is 4% of vehicle value for comprehensive'
            }
          ]
        }
      },
      {
        id: 'health_family_plans',
        content: `Family health insurance plans: Cover spouse + 2 children. Basic (GH₵ 400-700/month), Standard (GH₵ 900-1,800/month), Premium (GH₵ 1,800-3,200/month). Age-based pricing with family discounts available.`,
        metadata: {
          type: 'product',
          category: 'health_insurance',
          subcategory: 'family_plan',
          priority: 'high',
          productTypes: ['health'],
          customerSegments: ['family_oriented'],
          conversationStage: ['discovery', 'presentation'],
          lastUpdated: new Date(),
          effectiveness: 0.85,
          tags: ['family', 'health'],
          companyId: this.companyId,
          version: '2.0'
        }
      }
    ];

    for (const doc of sampleDocuments) {
      await this.addDocument(doc);
    }
  }

  // ===== UTILITY METHODS =====

  private isEnhancedQueryContext(context: any): context is EnhancedQueryContext {
    return context && 
           context.customer && 
           context.conversation && 
           context.market && 
           context.product;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  private matchesFilters(document: VectorDocument, filters: SearchFilter): boolean {
    // Product type filter
    if (filters.productTypes && filters.productTypes.length > 0) {
      const hasProductMatch = filters.productTypes.some(type => 
        document.metadata.productTypes?.includes(type)
      );
      if (!hasProductMatch) return false;
    }

    // Customer segment filter
    if (filters.customerSegments && filters.customerSegments.length > 0) {
      const hasSegmentMatch = filters.customerSegments.some(segment => 
        document.metadata.customerSegments?.includes(segment)
      );
      if (!hasSegmentMatch) return false;
    }

    // Minimum effectiveness filter
    if (filters.minEffectiveness !== undefined) {
      const effectiveness = document.performance?.effectiveness || document.metadata.effectiveness || 0.5;
      if (effectiveness < filters.minEffectiveness) return false;
    }

    return true;
  }

  private validatePremiumParameters(insuranceType: string, parameters: any): { valid: boolean; error?: string } {
    switch (insuranceType.toLowerCase()) {
      case 'auto':
        if (!parameters.vehicleValue && !parameters.vehicle_value) {
          return { valid: false, error: 'Vehicle value is required for auto insurance calculation' };
        }
        if (!parameters.age && !parameters.driverAge && !parameters.driver_age) {
          return { valid: false, error: 'Driver age is required for auto insurance calculation' };
        }
        break;
      case 'health':
        if (!parameters.age) {
          return { valid: false, error: 'Age is required for health insurance calculation' };
        }
        break;
      case 'life':
        if (!parameters.age) {
          return { valid: false, error: 'Age is required for life insurance calculation' };
        }
        break;
    }
    return { valid: true };
  }

  private determineCustomerSegment(customer: any): string {
    const age = customer.age || 30;
    if (age >= 22 && age <= 35) return 'young_professional';
    if (age >= 25 && age <= 50) return 'family_oriented';
    if (age >= 30 && age <= 65) return 'business_owner';
    if (age >= 55) return 'senior';
    return 'young_professional';
  }

  private calculateCustomerMatch(document: VectorDocument, context: EnhancedQueryContext): number {
    let score = 0;
    const customerSegment = this.determineCustomerSegment(context.customer);
    
    if (document.metadata.customerSegments?.includes(customerSegment)) {
      score += 0.5;
    }
    
    if (document.metadata.productTypes?.includes(context.product.primaryFocus)) {
      score += 0.3;
    }
    
    if (document.metadata.locationRelevance?.includes(context.customer.location)) {
      score += 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  private calculateUrgencyMatch(document: VectorDocument, context: EnhancedQueryContext): number {
    if (document.metadata.urgencyLevel?.includes(context.product.urgencyLevel)) {
      return 1.0;
    }
    return 0.3;
  }

  private calculateSeasonalMatch(document: VectorDocument, context: EnhancedQueryContext): number {
    if (document.metadata.seasonalRelevance?.includes(context.market.season)) {
      return 1.0;
    }
    return 0.3;
  }

  private calculateConfidence(rankedDocuments: Array<{document: VectorDocument, score: number}>): number {
    if (rankedDocuments.length === 0) return 0.1;
    
    const avgScore = rankedDocuments.reduce((sum, item) => sum + item.score, 0) / rankedDocuments.length;
    const topScore = rankedDocuments[0].score;
    const documentCount = rankedDocuments.length;
    
    let confidence = (avgScore * 0.6) + (topScore * 0.4);
    
    // Boost for having multiple relevant documents
    if (documentCount >= 3) confidence += 0.1;
    if (documentCount >= 5) confidence += 0.1;
    
    return Math.min(0.95, confidence);
  }

  private extractMetadataInsights(documents: EnhancedRAGDocument[]): ContextualQueryResult['metadata'] {
    const types = documents.map(doc => doc.metadata.type);
    
    return {
      hasProductInfo: types.includes('product'),
      hasObjectionHandling: types.includes('objection'),
      hasMarketContext: types.includes('market_context'),
      hasPremiumCalculation: types.includes('premium_calculation'),
      hasRiskFactors: types.includes('risk_factors'),
      hasClaimsInfo: types.includes('claims'),
      hasLocalRelevance: documents.some(doc => doc.metadata.locationRelevance && doc.metadata.locationRelevance.length > 0),
      calculationCapability: types.includes('premium_calculation'),
      seasonalRelevance: documents.some(doc => doc.metadata.seasonalRelevance && doc.metadata.seasonalRelevance.length > 0)

    };
  }

  private extractBasicMetadata(documents: EnhancedRAGDocument[]): ContextualQueryResult['metadata'] {
    const types = documents.map(doc => doc.metadata.type);
    
    return {
      hasProductInfo: types.includes('product'),
      hasObjectionHandling: types.includes('objection'),
      hasMarketContext: false,
      hasPremiumCalculation: types.includes('premium_calculation'),
      hasRiskFactors: types.includes('risk_factors'),
      hasClaimsInfo: types.includes('claims'),
      hasLocalRelevance: false,
      calculationCapability: types.includes('premium_calculation'),
      seasonalRelevance: false
    };
  }

  private calculateAverageCustomerMatch(
    rankedDocuments: Array<{document: VectorDocument, score: number}>,
    context: EnhancedQueryContext
  ): number {
    if (rankedDocuments.length === 0) return 0;
    
    const matches = rankedDocuments.map(item => this.calculateCustomerMatch(item.document, context));
    return matches.reduce((sum, match) => sum + match, 0) / matches.length;
  }

  private calculateAverageSituationalRelevance(
    rankedDocuments: Array<{document: VectorDocument, score: number}>,
    context: EnhancedQueryContext
  ): number {
    if (rankedDocuments.length === 0) return 0;
    
    const relevances = rankedDocuments.map(item => {
      if (item.document.metadata.conversationStage?.includes(context.conversation.stage)) {
        return 1.0;
      }
      return 0.3;
    });
    
    return relevances.reduce((sum, rel) => sum + rel, 0) / relevances.length;
  }

  private calculateAverageMarketAlignment(
    rankedDocuments: Array<{document: VectorDocument, score: number}>,
    context: EnhancedQueryContext
  ): number {
    if (rankedDocuments.length === 0) return 0;
    
    const alignments = rankedDocuments.map(item => {
      let score = 0;
      
      if (item.document.metadata.seasonalRelevance?.includes(context.market.season)) {
        score += 0.5;
      }
      
      if (item.document.metadata.locationRelevance?.includes(context.customer.location)) {
        score += 0.3;
      }
      
      return Math.min(score, 1.0);
    });
    
    return alignments.reduce((sum, align) => sum + align, 0) / alignments.length;
  }

  private calculateAverageUrgencyMatch(
    rankedDocuments: Array<{document: VectorDocument, score: number}>,
    context: EnhancedQueryContext
  ): number {
    if (rankedDocuments.length === 0) return 0;
    
    const matches = rankedDocuments.map(item => this.calculateUrgencyMatch(item.document, context));
    return matches.reduce((sum, match) => sum + match, 0) / matches.length;
  }

  private generateRecommendations(
    documents: EnhancedRAGDocument[],
    context: EnhancedQueryContext
  ): ContextualQueryResult['recommendations'] {
    
    const nextBestActions: string[] = [];
    const followUpQuestions: string[] = [];
    const additionalInfo: string[] = [];

    // Based on conversation stage
    switch (context.conversation.stage) {
      case 'discovery':
        nextBestActions.push('gather_more_customer_info', 'present_relevant_products');
        followUpQuestions.push('What specific coverage are you most concerned about?');
        break;
      case 'presentation':
        nextBestActions.push('address_specific_needs', 'provide_examples');
        followUpQuestions.push('Would you like me to explain how this works in your specific situation?');
        break;
      case 'objection_handling':
        nextBestActions.push('address_concerns', 'provide_reassurance');
        followUpQuestions.push('What specific aspect concerns you most?');
        break;
      case 'premium_calculation':
        nextBestActions.push('provide_quote', 'explain_pricing');
        followUpQuestions.push('Would you like to see how this fits within your budget?');
        break;
      case 'closing':
        nextBestActions.push('finalize_application', 'schedule_follow_up');
        followUpQuestions.push('Are you ready to move forward with this coverage?');
        break;
    }

    // Based on urgency
    if (context.product.urgencyLevel === 'high' || context.product.urgencyLevel === 'urgent') {
      nextBestActions.unshift('provide_immediate_quote', 'schedule_urgent_call');
    }

    // Based on season
    if (context.market.season === 'harmattan') {
      additionalInfo.push('Consider dust damage coverage during Harmattan season');
    } else if (context.market.season === 'rainy') {
      additionalInfo.push('Flood protection is especially important during rainy season');
    }

    // Based on documents found
    const hasPremiumCalc = documents.some(doc => doc.metadata.type === 'premium_calculation');
    if (hasPremiumCalc) {
      nextBestActions.push('calculate_premium');
      followUpQuestions.push('Would you like me to calculate your premium?');
    }

    return {
      nextBestActions: [...new Set(nextBestActions)].slice(0, 3),
      followUpQuestions: [...new Set(followUpQuestions)].slice(0, 2),
      additionalInfo: [...new Set(additionalInfo)].slice(0, 3)
    };
  }

  private assessPremiumCalculationCapability(
    documents: EnhancedRAGDocument[],
    query: string
  ): ContextualQueryResult['premiumCalculation'] {
    
    // Check if documents contain premium calculation info
    const hasPremiumCalcDocs = documents.some(doc => 
      doc.metadata.type === 'premium_calculation' || 
      doc.metadata.calculationRules
    );
    
    // Check if query indicates premium calculation intent
    const premiumKeywords = ['premium', 'cost', 'price', 'quote', 'calculate', 'how much'];
    const isPremiumQuery = premiumKeywords.some(keyword => 
      query.toLowerCase().includes(keyword)
    );
    
    if (hasPremiumCalcDocs || isPremiumQuery) {
      // Determine required fields based on query content
      let requiredFields: string[] = [];
      const lowerQuery = query.toLowerCase();
      
      if (lowerQuery.includes('auto') || lowerQuery.includes('car')) {
        requiredFields = ['vehicleValue', 'age', 'location'];
      } else if (lowerQuery.includes('health')) {
        requiredFields = ['age', 'planType'];
      } else if (lowerQuery.includes('life')) {
        requiredFields = ['age', 'coverage'];
      } else {
        requiredFields = ['age', 'insuranceType'];
      }
      
      return {
        canCalculate: hasPremiumCalcDocs,
        requiredFields,
        estimatedRange: this.getEstimatedPremiumRange(lowerQuery)
      };
    }
    
    return {
      canCalculate: false,
      requiredFields: []
    };
  }

  private getEstimatedPremiumRange(query: string): { min: number; max: number } | undefined {
    if (query.includes('auto') || query.includes('car')) {
      return { min: 2400, max: 7200 }; // Annual auto insurance range
    } else if (query.includes('health')) {
      return { min: 1800, max: 18000 }; // Annual health insurance range
    } else if (query.includes('life')) {
      return { min: 1000, max: 25000 }; // Annual life insurance range
    }
    return undefined;
  }

  /**
   * Save documents to file
   */
  private async saveToFile(): Promise<void> {
    try {
      const data = {
        documents: this.documents,
        lastUpdated: new Date(),
        companyId: this.companyId,
        version: '2.0',
        mode: this.mode
      };
      await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2));
      console.log('💾 Enhanced vector store saved to file');
    } catch (error) {
      console.error('❌ Failed to save data to file:', error);
    }
  }

  /**
   * Get knowledge base statistics
   */
  getKnowledgeStats(): any {
    const stats = {
      totalDocuments: this.documents.length,
      documentTypes: {} as { [key: string]: number },
      categories: {} as { [key: string]: number },
      productTypes: {} as { [key: string]: number },
      customerSegments: {} as { [key: string]: number },
      averageEffectiveness: 0,
      premiumCalculationSupport: false,
      lastUpdated: new Date(),
      cacheSize: this.queryCache.size,
      mode: this.mode
    };

    let totalEffectiveness = 0;
    let premiumCalcCount = 0;

    this.documents.forEach(doc => {
      // Count by type
      stats.documentTypes[doc.metadata.type] = (stats.documentTypes[doc.metadata.type] || 0) + 1;
      
      // Count by category
      if (doc.metadata.category) {
        stats.categories[doc.metadata.category] = (stats.categories[doc.metadata.category] || 0) + 1;
      }

      // Count by product types
      doc.metadata.productTypes?.forEach(product => {
        stats.productTypes[product] = (stats.productTypes[product] || 0) + 1;
      });

      // Count by customer segments
      doc.metadata.customerSegments?.forEach(segment => {
        stats.customerSegments[segment] = (stats.customerSegments[segment] || 0) + 1;
      });

      // Track effectiveness
      const effectiveness = doc.performance?.effectiveness || doc.metadata.effectiveness || 0.5;
      totalEffectiveness += effectiveness;

      // Check for premium calculation support
      if (doc.metadata.type === 'premium_calculation' || doc.metadata.calculationRules) {
        premiumCalcCount++;
      }
    });

    stats.averageEffectiveness = this.documents.length > 0 
      ? totalEffectiveness / this.documents.length 
      : 0;

    stats.premiumCalculationSupport = premiumCalcCount > 0;

    return stats;
  }

  /**
   * Get performance analytics
   */
  getPerformanceAnalytics(): any {
    const documentUsage = new Map<string, number>();
    let totalQueries = 0;
    let totalRelevance = 0;

    this.documents.forEach(doc => {
      if (doc.performance) {
        totalQueries += doc.performance.queryCount;
        totalRelevance += doc.performance.averageRelevance * doc.performance.queryCount;
        
        if (doc.performance.queryCount > 0) {
          documentUsage.set(doc.id, doc.performance.effectiveness);
        }
      }
    });

    const topPerformingDocuments = Array.from(documentUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, effectiveness]) => ({
        id,
        effectiveness: effectiveness.toFixed(3),
        queryCount: this.documents.find(d => d.id === id)?.performance?.queryCount || 0
      }));

    return {
      totalQueries,
      averageResponseTime: 0, // Would be tracked with timing
      averageRelevance: totalQueries > 0 ? (totalRelevance / totalQueries).toFixed(3) : '0.000',
      topPerformingDocuments,
      commonQueryTypes: [], // Would be tracked with query classification
      effectivenessDistribution: this.getEffectivenessDistribution(),
      documentsCount: this.documents.length,
      cacheHitRate: this.calculateCacheHitRate(),
      premiumCalculationQueries: this.documents.filter(d => 
        d.metadata.type === 'premium_calculation'
      ).length
    };
  }

  private getEffectivenessDistribution(): any {
    const distribution = {
      'high (0.8+)': 0,
      'medium (0.5-0.8)': 0,
      'low (0.0-0.5)': 0
    };

    this.documents.forEach(doc => {
      const eff = doc.performance?.effectiveness || doc.metadata.effectiveness || 0.5;
      if (eff >= 0.8) distribution['high (0.8+)']++;
      else if (eff >= 0.5) distribution['medium (0.5-0.8)']++;
      else distribution['low (0.0-0.5)']++;
    });

    return distribution;
  }

  private calculateCacheHitRate(): string {
    // Simple approximation - in real implementation, track cache hits
    const hitRate = Math.min(0.3, this.queryCache.size / Math.max(1, this.documents.length));
    return (hitRate * 100).toFixed(1) + '%';
  }

  /**
   * Clear cache (for performance management)
   */
  clearCache(): void {
    this.queryCache.clear();
    console.log('🧹 Query cache cleared');
  }

  /**
   * Get document by ID
   */
  getDocument(documentId: string): EnhancedRAGDocument | null {
    const vectorDoc = this.documents.find(doc => doc.id === documentId);
    if (!vectorDoc) return null;

    return {
      id: vectorDoc.id,
      content: vectorDoc.content,
      metadata: vectorDoc.metadata
    };
  }

  /**
   * Remove document by ID
   */
  async removeDocument(documentId: string): Promise<boolean> {
    const initialLength = this.documents.length;
    this.documents = this.documents.filter(doc => doc.id !== documentId);
    
    if (this.documents.length < initialLength) {
      this.queryCache.clear();
      await this.saveToFile();
      console.log(`🗑️ Removed document: ${documentId}`);
      return true;
    }
    
    return false;
  }

  /**
   * Search documents by metadata
   */
  searchByMetadata(criteria: Partial<EnhancedRAGDocument['metadata']>): EnhancedRAGDocument[] {
    const matches = this.documents.filter(doc => {
      // Check each criteria
      for (const [key, value] of Object.entries(criteria)) {
        const docValue = (doc.metadata as any)[key];
        
        if (Array.isArray(value)) {
          // For array criteria, check if any value matches
          if (!Array.isArray(docValue) || !value.some(v => docValue.includes(v))) {
            return false;
          }
        } else {
          // For single values, check exact match
          if (docValue !== value) {
            return false;
          }
        }
      }
      return true;
    });

    return matches.map(doc => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata
    }));
  }

  /**
   * Update document performance metrics
   */
  updateDocumentPerformance(documentId: string, relevanceScore: number): void {
    const doc = this.documents.find(d => d.id === documentId);
    if (doc && doc.performance) {
      doc.performance.queryCount++;
      doc.performance.lastUsed = new Date();
      
      // Update running average of relevance
      const currentAvg = doc.performance.averageRelevance;
      const count = doc.performance.queryCount;
      doc.performance.averageRelevance = (currentAvg * (count - 1) + relevanceScore) / count;
      
      // Update effectiveness (weighted average with relevance)
      doc.performance.effectiveness = (doc.performance.effectiveness * 0.8) + (relevanceScore * 0.2);
      
      console.log(`📊 Updated performance for ${documentId}: effectiveness=${doc.performance.effectiveness.toFixed(3)}`);
    }
  }
}

export default EnhancedVectorStore;