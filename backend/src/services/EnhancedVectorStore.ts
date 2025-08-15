// Enhanced Vector Store V2 - Premium Calculation Support
// File: backend/src/services/EnhancedVectorStore.ts

import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { enhancedKnowledgeBase, EnhancedRAGDocument, PremiumCalculationService } from '../data/enhanced-knowledge-base';

interface EnhancedRAGQueryResult {
  documents: EnhancedRAGDocument[];
  context: string;
  confidence: number;
  metadata: {
    hasProductInfo: boolean;
    hasObjectionHandling: boolean;
    hasMarketContext: boolean;
    hasPremiumCalculation: boolean;
    hasRiskFactors: boolean;
    hasClaimsInfo: boolean;
    calculationCapability?: boolean;
  };
  premiumCalculation?: {
    canCalculate: boolean;
    requiredFields: string[];
    estimatedRange?: { min: number; max: number };
  };
}

interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: EnhancedRAGDocument['metadata'];
}

export class EnhancedVectorStore {
  private openai: OpenAI | null = null;
  private documents: VectorDocument[] = [];
  private knowledgeCache: Map<string, EnhancedRAGQueryResult> = new Map();
  private initialized = false;
  private companyId: string;
  private dataPath: string;

  constructor(companyId: string = 'default') {
    this.companyId = companyId;
    this.dataPath = path.join(process.cwd(), 'data', `enhanced_knowledge_${companyId}.json`);
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
   * Initialize the enhanced vector store with premium calculation capabilities
   */
  async initialize(): Promise<void> {
    console.log(`🚀 Initializing Enhanced Vector Store V2 for company ${this.companyId}`);
    
    this.initializeOpenAI();
    
    try {
      // Create data directory if it doesn't exist
      await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
      
      // Try to load existing data
      try {
        const data = await fs.readFile(this.dataPath, 'utf-8');
        const parsed = JSON.parse(data);
        this.documents = parsed.documents || [];
        console.log(`📚 Loaded ${this.documents.length} existing documents`);
      } catch {
        // File doesn't exist, load enhanced knowledge base
        console.log('📖 No existing data found, loading enhanced knowledge base...');
        await this.loadEnhancedKnowledgeBase();
      }
      
      this.initialized = true;
      console.log('✅ Enhanced Vector Store V2 initialized successfully');
      console.log(`📊 Knowledge categories: ${this.getKnowledgeCategories()}`);
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced Vector Store:', error);
      throw error;
    }
  }

  /**
   * Load the enhanced knowledge base with premium calculation support
   */
  private async loadEnhancedKnowledgeBase(): Promise<void> {
    console.log('🔄 Loading enhanced knowledge base with premium calculations...');
    
    for (const doc of enhancedKnowledgeBase) {
      const embedding = await this.generateEmbedding(doc.content);
      
      const vectorDoc: VectorDocument = {
        id: doc.id,
        content: doc.content,
        embedding,
        metadata: doc.metadata
      };
      
      this.documents.push(vectorDoc);
    }
    
    // Save to file
    await this.saveToFile();
    console.log(`💾 Loaded ${this.documents.length} enhanced documents`);
  }

  /**
   * Generate embedding for text content
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
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Enhanced query with premium calculation detection
   */
  async queryKnowledge(question: string, context: any = {}): Promise<EnhancedRAGQueryResult> {
    if (!this.initialized) await this.initialize();

    try {
      // Build enhanced query with context
      const enhancedQuery = this.buildContextualQuery(question, context);
      
      // Check cache first
      const cacheKey = `${enhancedQuery}_${JSON.stringify(context)}`;
      if (this.knowledgeCache.has(cacheKey)) {
        console.log('📋 Returning cached result');
        return this.knowledgeCache.get(cacheKey)!;
      }

      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(enhancedQuery);

      // Calculate similarities and find most relevant documents
      const similarities = this.documents.map(doc => ({
        document: doc,
        similarity: this.cosineSimilarity(queryEmbedding, doc.embedding)
      }));

      // Sort by similarity and take top results
      similarities.sort((a, b) => b.similarity - a.similarity);
      const topResults = similarities.slice(0, 8).filter(result => result.similarity > 0.4);

      // Convert to enhanced RAG format
      const relevantDocs: EnhancedRAGDocument[] = topResults.map(result => ({
        id: result.document.id,
        content: result.document.content,
        metadata: result.document.metadata
      }));

      // Detect premium calculation intent
      const premiumCalculation = this.detectPremiumCalculationIntent(question, relevantDocs, context);

      const result: EnhancedRAGQueryResult = {
        documents: relevantDocs,
        context: this.buildResponseContext(relevantDocs),
        confidence: this.calculateConfidence(relevantDocs, question),
        metadata: this.extractEnhancedMetadata(relevantDocs),
        premiumCalculation
      };

      // Cache result
      this.knowledgeCache.set(cacheKey, result);
      
      console.log(`🎯 Query processed: ${relevantDocs.length} relevant docs found`);
      if (premiumCalculation.canCalculate) {
        console.log('💰 Premium calculation capability detected');
      }
      
      return result;
    } catch (error) {
      console.error('❌ Failed to query enhanced knowledge:', error);
      throw error;
    }
  }

  /**
   * Build contextual query with enhanced parameters
   */
  private buildContextualQuery(question: string, context: any): string {
    let enhancedQuery = question;
    
    // Add insurance type context
    if (context.productType) enhancedQuery += ` ${context.productType} insurance`;
    if (context.leadSource) enhancedQuery += ` ${context.leadSource} customer`;
    if (context.stage) enhancedQuery += ` ${context.stage} conversation`;
    if (context.budget) enhancedQuery += ` budget ${context.budget}`;
    
    // Add premium calculation context
    if (this.isPremiumQuery(question)) {
      enhancedQuery += ' premium calculation cost pricing';
    }
    
    // Add risk assessment context
    if (this.isRiskAssessmentQuery(question)) {
      enhancedQuery += ' risk factors assessment underwriting';
    }
    
    return enhancedQuery;
  }

  /**
   * Detect if query is about premium calculation
   */
  private isPremiumQuery(question: string): boolean {
    const premiumKeywords = [
      'premium', 'cost', 'price', 'pricing', 'calculate', 'quote', 
      'how much', 'expensive', 'cheap', 'affordable', 'payment'
    ];
    return premiumKeywords.some(keyword => 
      question.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Detect if query is about risk assessment
   */
  private isRiskAssessmentQuery(question: string): boolean {
    const riskKeywords = [
      'risk', 'factors', 'assessment', 'age', 'driving record', 
      'health condition', 'location', 'occupation', 'medical'
    ];
    return riskKeywords.some(keyword => 
      question.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Detect premium calculation intent and capability
   */
  private detectPremiumCalculationIntent(
    question: string, 
    documents: EnhancedRAGDocument[], 
    context: any
  ): { canCalculate: boolean; requiredFields: string[]; estimatedRange?: { min: number; max: number } } {
    
    const isPremiumQuery = this.isPremiumQuery(question);
    const hasCalculationDocs = documents.some(doc => 
      doc.metadata.type === 'premium_calculation' || 
      doc.metadata.calculationRules
    );
    
    if (!isPremiumQuery) {
      return { canCalculate: false, requiredFields: [] };
    }

    // Determine insurance type from query or context
    const insuranceType = this.detectInsuranceType(question, context);
    
    let requiredFields: string[] = [];
    let estimatedRange: { min: number; max: number } | undefined;

    switch (insuranceType) {
      case 'auto':
        requiredFields = [
          'vehicleValue', 'vehicleAge', 'driverAge', 'location', 
          'coverageType', 'drivingHistory'
        ];
        estimatedRange = { min: 240, max: 12000 };
        break;
        
      case 'health':
        requiredFields = [
          'age', 'planType', 'familySize', 'smokingStatus', 'occupation'
        ];
        estimatedRange = { min: 150, max: 3200 };
        break;
        
      case 'life':
        requiredFields = [
          'age', 'coverageAmount', 'policyType', 'smokingStatus', 'occupation'
        ];
        estimatedRange = { min: 100, max: 50000 };
        break;
        
      case 'business':
        requiredFields = [
          'businessType', 'employeeCount', 'propertyValue', 'annualRevenue'
        ];
        estimatedRange = { min: 1200, max: 24000 };
        break;
        
      default:
        requiredFields = ['insuranceType'];
        break;
    }

    return {
      canCalculate: hasCalculationDocs && insuranceType !== 'unknown',
      requiredFields,
      estimatedRange
    };
  }

  /**
   * Detect insurance type from query content
   */
  private detectInsuranceType(question: string, context: any): string {
    if (context.productType) return context.productType;
    
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('auto') || lowerQuestion.includes('car') || lowerQuestion.includes('vehicle')) {
      return 'auto';
    }
    if (lowerQuestion.includes('health') || lowerQuestion.includes('medical')) {
      return 'health';
    }
    if (lowerQuestion.includes('life') || lowerQuestion.includes('death benefit')) {
      return 'life';
    }
    if (lowerQuestion.includes('business') || lowerQuestion.includes('commercial')) {
      return 'business';
    }
    
    return 'unknown';
  }

  /**
   * Build enhanced response context
   */
  private buildResponseContext(documents: EnhancedRAGDocument[]): string {
    // Group documents by type for better organization
    const docsByType = documents.reduce((acc, doc) => {
      if (!acc[doc.metadata.type]) acc[doc.metadata.type] = [];
      acc[doc.metadata.type].push(doc);
      return acc;
    }, {} as { [key: string]: EnhancedRAGDocument[] });

    let context = '';

    // Prioritize premium calculation info
    if (docsByType.premium_calculation) {
      context += '=== PREMIUM CALCULATION INFORMATION ===\n';
      context += docsByType.premium_calculation.map((doc: any) => doc.content).join('\n\n');
      context += '\n\n';
    }

    // Add risk factors
    if (docsByType.risk_factors) {
      context += '=== RISK FACTORS ===\n';
      context += docsByType.risk_factors.map((doc: any) => doc.content).join('\n\n');
      context += '\n\n';
    }

    // Add other document types
    Object.entries(docsByType).forEach(([type, docs]) => {
      if (type !== 'premium_calculation' && type !== 'risk_factors') {
        context += `=== ${type.toUpperCase().replace('_', ' ')} ===\n`;
        context += docs.map((doc: any) => doc.content).join('\n\n');
        context += '\n\n';
      }
    });

    return context;
  }

  /**
   * Calculate confidence score for enhanced results
   */
  private calculateConfidence(documents: EnhancedRAGDocument[], question: string): number {
    if (documents.length === 0) return 0.2;
    
    let confidence = 0.6; // Base confidence
    
    // Boost confidence for premium calculation queries with calculation docs
    if (this.isPremiumQuery(question)) {
      const hasCalcDocs = documents.some(doc => doc.metadata.type === 'premium_calculation');
      if (hasCalcDocs) confidence += 0.2;
    }
    
    // Boost confidence based on document count and relevance
    if (documents.length >= 5) confidence += 0.15;
    else if (documents.length >= 3) confidence += 0.1;
    
    // Boost confidence for high-priority documents
    const hasHighPriority = documents.some(doc => doc.metadata.priority === 'high');
    if (hasHighPriority) confidence += 0.05;
    
    return Math.min(confidence, 0.95);
  }

  /**
   * Extract enhanced metadata from documents
   */
  private extractEnhancedMetadata(documents: EnhancedRAGDocument[]): EnhancedRAGQueryResult['metadata'] {
    return {
      hasProductInfo: documents.some(d => d.metadata.type === 'product'),
      hasObjectionHandling: documents.some(d => d.metadata.type === 'objection'),
      hasMarketContext: documents.some(d => d.metadata.type === 'market_context'),
      hasPremiumCalculation: documents.some(d => d.metadata.type === 'premium_calculation'),
      hasRiskFactors: documents.some(d => d.metadata.type === 'risk_factors'),
      hasClaimsInfo: documents.some(d => d.metadata.type === 'claims'),
      calculationCapability: documents.some(d => d.metadata.calculationRules && d.metadata.calculationRules.length > 0)
    };
  }

  /**
   * Get knowledge categories summary
   */
  private getKnowledgeCategories(): string {
    const categories = [...new Set(this.documents.map(d => d.metadata.type))];
    return categories.join(', ');
  }

  /**
   * Calculate premium using embedded calculation rules
   */
  async calculatePremium(
    insuranceType: string, 
    parameters: any
  ): Promise<{ success: boolean; premium?: number; breakdown?: any; error?: string }> {
    
    try {
      switch (insuranceType.toLowerCase()) {
        case 'auto':
          if (!this.validateAutoParameters(parameters)) {
            return { 
              success: false, 
              error: 'Missing required parameters for auto insurance calculation' 
            };
          }
          const autoResult = PremiumCalculationService.calculateAutoPremium(parameters);
          return { success: true, ...autoResult };
          
        case 'health':
          if (!this.validateHealthParameters(parameters)) {
            return { 
              success: false, 
              error: 'Missing required parameters for health insurance calculation' 
            };
          }
          const healthResult = PremiumCalculationService.calculateHealthPremium(parameters);
          return { success: true, ...healthResult };
          
        default:
          return { 
            success: false, 
            error: `Premium calculation not yet supported for ${insuranceType} insurance` 
          };
      }
    } catch (error) {
      console.error('Premium calculation error:', error);
      return { 
        success: false, 
        error: 'Failed to calculate premium. Please try again.' 
      };
    }
  }

  /**
   * Validate auto insurance parameters
   */
  private validateAutoParameters(params: any): boolean {
    const required = ['vehicleValue', 'vehicleAge', 'driverAge', 'location', 'coverageType'];
    return required.every(field => params[field] !== undefined && params[field] !== null);
  }

  /**
   * Validate health insurance parameters
   */
  private validateHealthParameters(params: any): boolean {
    const required = ['age', 'planType', 'familySize', 'smokingStatus'];
    return required.every(field => params[field] !== undefined && params[field] !== null);
  }

  /**
   * Add new knowledge to the vector store
   */
  async addDocument(document: EnhancedRAGDocument): Promise<void> {
    if (!this.initialized) await this.initialize();
    
    const embedding = await this.generateEmbedding(document.content);
    
    const vectorDoc: VectorDocument = {
      id: document.id,
      content: document.content,
      embedding,
      metadata: document.metadata
    };
    
    // Remove existing document with same ID
    this.documents = this.documents.filter(d => d.id !== document.id);
    
    // Add new document
    this.documents.push(vectorDoc);
    
    // Clear cache
    this.knowledgeCache.clear();
    
    console.log(`📄 Added/updated document: ${document.id}`);
  }

  /**
   * Update knowledge base with new documents
   */
  async updateKnowledge(newKnowledge: EnhancedRAGDocument[]): Promise<void> {
    if (!this.initialized) await this.initialize();
    
    for (const doc of newKnowledge) {
      await this.addDocument(doc);
    }
    
    // Save to file
    await this.saveToFile();
    
    console.log(`🔄 Knowledge base updated with ${newKnowledge.length} new documents`);
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
        version: '2.0'
      };
      await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2));
      console.log('💾 Knowledge base saved to file');
    } catch (error) {
      console.error('❌ Failed to save data to file:', error);
    }
  }

  /**
   * Get statistics about the knowledge base
   */
  getKnowledgeStats(): any {
    const stats = {
      totalDocuments: this.documents.length,
      documentTypes: {} as { [key: string]: number },
      categories: {} as { [key: string]: number },
      lastUpdated: new Date(),
      cacheSize: this.knowledgeCache.size
    };

    this.documents.forEach(doc => {
      // Count by type
      stats.documentTypes[doc.metadata.type] = (stats.documentTypes[doc.metadata.type] || 0) + 1;
      
      // Count by category
      if (doc.metadata.category) {
        stats.categories[doc.metadata.category] = (stats.categories[doc.metadata.category] || 0) + 1;
      }
    });

    return stats;
  }
}

export default EnhancedVectorStore;