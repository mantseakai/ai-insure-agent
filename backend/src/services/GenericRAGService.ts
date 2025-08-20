// Generic RAG Service for Multi-Domain Support
// File: backend/src/services/GenericRAGService.ts

import { DomainConfig } from '../types/domain';
import OpenAI from 'openai';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface GenericRAGDocument {
  id: string;
  content: string;
  metadata: {
    type: string;
    category: string;
    domain: string;
    priority: 'high' | 'medium' | 'low';
    tags?: string[];
    lastUpdated: Date;
    version: string;
    [key: string]: any;
  };
}

export interface GenericRAGQueryResult {
  documents: GenericRAGDocument[];
  context: string;
  confidence: number;
  metadata: any;
  domainSpecific?: any;
}

interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: any;
}

export class GenericRAGService {
  private openai: OpenAI;
  private domainConfig: DomainConfig;
  private documents: VectorDocument[] = [];
  private initialized: boolean = false;
  private knowledgeCache: Map<string, GenericRAGQueryResult> = new Map();
  private dataPath: string;

  constructor(domainConfig: DomainConfig) {
    this.domainConfig = domainConfig;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || ''
    });
    this.dataPath = path.join(process.cwd(), 'data', `${domainConfig.domain}-knowledge.json`);
  }

  /**
   * Initialize the RAG service with domain-specific knowledge
   */
  async initialize(): Promise<void> {
    console.log(`🧠 Initializing Generic RAG Service for domain: ${this.domainConfig.domain}`);
    
    try {
      // Try to load existing knowledge base
      await this.loadFromFile();
    } catch (error) {
      console.log('📝 No existing knowledge base found, starting fresh');
      // Load default knowledge for the domain
      await this.loadDefaultKnowledge();
    }

    this.initialized = true;
    console.log(`✅ RAG Service ready with ${this.documents.length} documents`);
  }

  /**
   * Query knowledge base with domain-aware context
   */
  async queryKnowledge(question: string, context: any = {}): Promise<GenericRAGQueryResult> {
    if (!this.initialized) await this.initialize();

    try {
      // Build enhanced query with domain context
      const enhancedQuery = this.buildDomainContextualQuery(question, context);
      
      // Check cache first
      const cacheKey = `${enhancedQuery}_${JSON.stringify(context)}_${this.domainConfig.domain}`;
      if (this.knowledgeCache.has(cacheKey)) {
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
      
      // Apply domain-specific filtering and ranking
      const filteredResults = this.applyDomainFiltering(similarities, context);
      const topResults = filteredResults.slice(0, 8).filter(result => result.similarity > 0.4);

      // Convert to GenericRAGDocument format
      const relevantDocs: GenericRAGDocument[] = topResults.map(result => ({
        id: result.document.id,
        content: result.document.content,
        metadata: result.document.metadata
      }));

      // Detect domain-specific functionality
      const domainSpecific = this.detectDomainSpecificNeeds(question, relevantDocs, context);

      const result: GenericRAGQueryResult = {
        documents: relevantDocs,
        context: this.buildDomainResponseContext(relevantDocs),
        confidence: this.calculateDomainConfidence(relevantDocs, question, context),
        metadata: this.extractDomainMetadata(relevantDocs),
        domainSpecific
      };

      // Cache result
      this.knowledgeCache.set(cacheKey, result);
      
      console.log(`🎯 Query processed for ${this.domainConfig.domain}: ${relevantDocs.length} relevant docs found`);
      
      return result;
    } catch (error) {
      console.error('❌ Failed to query domain knowledge:', error);
      throw error;
    }
  }

  /**
   * Build domain-specific contextual query
   */
  private buildDomainContextualQuery(question: string, context: any): string {
    let enhancedQuery = question;
    
    // Add domain context
    enhancedQuery += ` ${this.domainConfig.domain}`;
    
    // Add entity type context
    if (context.entityType) {
      enhancedQuery += ` ${context.entityType}`;
    }
    
    // Add stage-specific context
    if (context.stage) {
      enhancedQuery += ` ${context.stage}`;
    }
    
    // Apply domain-specific query enhancement based on configuration
    const queryEnhancements = this.domainConfig.ragConfig?.contextBuilding;
    if (queryEnhancements) {
      switch (queryEnhancements) {
        case 'prioritize_product_info':
          if (this.isProductQuery(question)) enhancedQuery += ' product specifications features';
          break;
        case 'prioritize_specifications':
          if (this.isTechnicalQuery(question)) enhancedQuery += ' technical specs requirements';
          break;
        case 'prioritize_style_context':
          if (this.isStyleQuery(question)) enhancedQuery += ' style fashion trend';
          break;
      }
    }
    
    return enhancedQuery;
  }

  /**
   * Apply domain-specific filtering and ranking to search results
   */
  private applyDomainFiltering(similarities: any[], context: any): any[] {
    return similarities.filter(result => {
      const doc = result.document;
      
      // Domain must match
      if (doc.metadata.domain !== this.domainConfig.domain) {
        return false;
      }
      
      // Apply category filtering if specified in context
      if (context.entityType && doc.metadata.category) {
        if (!doc.metadata.category.includes(context.entityType)) {
          // Boost similarity if category matches
          result.similarity *= 1.2;
        }
      }
      
      // Boost high-priority documents
      if (doc.metadata.priority === 'high') {
        result.similarity *= 1.15;
      }
      
      // Apply stage-specific filtering
      if (context.stage && doc.metadata.applicableStages) {
        if (doc.metadata.applicableStages.includes(context.stage)) {
          result.similarity *= 1.1;
        }
      }
      
      return true;
    });
  }

  /**
   * Build domain-specific response context
   */
  private buildDomainResponseContext(documents: GenericRAGDocument[]): string {
    // Group documents by type for better organization
    const docsByType = documents.reduce((acc, doc) => {
      if (!acc[doc.metadata.type]) acc[doc.metadata.type] = [];
      acc[doc.metadata.type].push(doc);
      return acc;
    }, {} as { [key: string]: GenericRAGDocument[] });

    let context = '';

    // Apply domain-specific context building rules
    const priorityTypes = this.getDomainContextPriority();
    
    priorityTypes.forEach(type => {
      if (docsByType[type]) {
        context += `=== ${type.toUpperCase().replace('_', ' ')} ===\n`;
        context += docsByType[type].map(doc => doc.content).join('\n\n');
        context += '\n\n';
        delete docsByType[type]; // Remove to avoid duplication
      }
    });

    // Add remaining document types
    Object.entries(docsByType).forEach(([type, docs]) => {
      context += `=== ${type.toUpperCase().replace('_', ' ')} ===\n`;
      context += docs.map(doc => doc.content).join('\n\n');
      context += '\n\n';
    });

    return context;
  }

  /**
   * Get domain-specific context priority order
   */
  private getDomainContextPriority(): string[] {
    switch (this.domainConfig.domain) {
      case 'insurance':
        return ['premium_calculation', 'product_info', 'risk_factors', 'objection_handling'];
      case 'electronics':
        return ['product_specs', 'compatibility', 'comparisons', 'troubleshooting'];
      case 'fashion':
        return ['style_guides', 'sizing_info', 'trend_updates', 'care_instructions'];
      default:
        return ['product_info', 'specifications', 'recommendations'];
    }
  }

  /**
   * Detect domain-specific functionality needs
   */
  private detectDomainSpecificNeeds(
    question: string, 
    documents: GenericRAGDocument[], 
    context: any
  ): any {
    const lowerQuestion = question.toLowerCase();
    
    switch (this.domainConfig.domain) {
      case 'insurance':
        return this.detectInsuranceNeeds(lowerQuestion, documents, context);
      case 'electronics':
        return this.detectElectronicsNeeds(lowerQuestion, documents, context);
      case 'fashion':
        return this.detectFashionNeeds(lowerQuestion, documents, context);
      default:
        return { needsBusinessLogic: false };
    }
  }

  /**
   * Insurance-specific needs detection
   */
  private detectInsuranceNeeds(question: string, documents: GenericRAGDocument[], context: any): any {
    const needsPremiumCalc = ['quote', 'premium', 'price', 'cost', 'calculate'].some(term => 
      question.includes(term)
    );
    
    const hasCalculationDocs = documents.some(doc => 
      doc.metadata.type === 'premium_calculation'
    );

    return {
      needsBusinessLogic: needsPremiumCalc,
      businessLogicType: needsPremiumCalc ? 'premium_calculation' : null,
      canCalculate: needsPremiumCalc && hasCalculationDocs,
      insuranceType: this.detectInsuranceType(question),
      requiresRiskAssessment: ['risk', 'safe', 'claim', 'accident'].some(term => question.includes(term))
    };
  }

  /**
   * Electronics-specific needs detection
   */
  private detectElectronicsNeeds(question: string, documents: GenericRAGDocument[], context: any): any {
    const needsComparison = ['compare', 'vs', 'versus', 'better', 'difference'].some(term => 
      question.includes(term)
    );
    
    const needsRecommendation = ['recommend', 'suggest', 'best', 'should i'].some(term => 
      question.includes(term)
    );

    return {
      needsBusinessLogic: needsComparison || needsRecommendation,
      businessLogicType: needsComparison ? 'product_comparison' : needsRecommendation ? 'product_recommendation' : null,
      deviceType: this.detectDeviceType(question),
      needsCompatibilityCheck: ['compatible', 'work with', 'support'].some(term => question.includes(term))
    };
  }

  /**
   * Fashion-specific needs detection
   */
  private detectFashionNeeds(question: string, documents: GenericRAGDocument[], context: any): any {
    const needsStyling = ['style', 'outfit', 'match', 'wear', 'look'].some(term => 
      question.includes(term)
    );
    
    const needsSizing = ['size', 'fit', 'measurements', 'small', 'large', 'medium'].some(term => 
      question.includes(term)
    );

    return {
      needsBusinessLogic: needsStyling || needsSizing,
      businessLogicType: needsStyling ? 'style_recommendation' : needsSizing ? 'size_consultation' : null,
      clothingType: this.detectClothingType(question),
      occasion: this.detectOccasion(question)
    };
  }

  /**
   * Calculate domain-aware confidence score
   */
  private calculateDomainConfidence(
    documents: GenericRAGDocument[], 
    question: string, 
    context: any
  ): number {
    if (documents.length === 0) return 0.2;
    
    let baseConfidence = Math.min(0.95, 0.4 + (documents.length * 0.15));
    
    // Apply domain-specific confidence adjustments
    const domainRelevantDocs = documents.filter(doc => 
      doc.metadata.domain === this.domainConfig.domain
    );
    
    if (domainRelevantDocs.length === documents.length) {
      baseConfidence *= 1.1; // Boost if all docs are domain-relevant
    }
    
    // Boost confidence if high-priority docs are found
    const highPriorityDocs = documents.filter(doc => 
      doc.metadata.priority === 'high'
    );
    
    if (highPriorityDocs.length > 0) {
      baseConfidence *= 1.05;
    }
    
    return Math.min(0.95, baseConfidence);
  }

  /**
   * Extract domain-specific metadata
   */
  private extractDomainMetadata(documents: GenericRAGDocument[]): any {
    const metadata = {
      domain: this.domainConfig.domain,
      documentTypes: [...new Set(documents.map(d => d.metadata.type))],
      categories: [...new Set(documents.map(d => d.metadata.category).filter(Boolean))],
      hasHighPriority: documents.some(d => d.metadata.priority === 'high'),
      confidence: documents.length > 0 ? 'high' : 'low'
    };

    // Add domain-specific metadata
    switch (this.domainConfig.domain) {
      case 'insurance':
        return {
          ...metadata,
          hasCalculationData: documents.some(d => d.metadata.type === 'premium_calculation'),
          hasRiskFactors: documents.some(d => d.metadata.type === 'risk_factors'),
          insuranceTypes: [...new Set(documents.map(d => d.metadata.category).filter(Boolean))]
        };
      case 'electronics':
        return {
          ...metadata,
          hasSpecs: documents.some(d => d.metadata.type === 'product_specs'),
          hasComparisons: documents.some(d => d.metadata.type === 'comparisons'),
          deviceCategories: [...new Set(documents.map(d => d.metadata.category).filter(Boolean))]
        };
      case 'fashion':
        return {
          ...metadata,
          hasStyleGuides: documents.some(d => d.metadata.type === 'style_guides'),
          hasSizingInfo: documents.some(d => d.metadata.type === 'sizing_info'),
          clothingTypes: [...new Set(documents.map(d => d.metadata.category).filter(Boolean))]
        };
      default:
        return metadata;
    }
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('❌ Failed to generate embedding:', error);
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
   * Load knowledge base from file
   */
  private async loadFromFile(): Promise<void> {
    try {
      const data = await fs.readFile(this.dataPath, 'utf-8');
      const parsed = JSON.parse(data);
      
      if (parsed.domain === this.domainConfig.domain) {
        this.documents = parsed.documents || [];
        console.log(`📚 Loaded ${this.documents.length} documents from existing knowledge base`);
      } else {
        throw new Error('Domain mismatch in knowledge base file');
      }
    } catch (error) {
      console.log('📝 Could not load existing knowledge base, will create new one');
      throw error;
    }
  }

  /**
   * Load default knowledge for the domain
   */
  private async loadDefaultKnowledge(): Promise<void> {
    try {
      // Try to load domain-specific default knowledge
      const defaultKnowledgePath = path.join(process.cwd(), 'src', 'data', `${this.domainConfig.domain}-default-knowledge.ts`);
      
      // Dynamically import domain-specific knowledge if it exists
      let defaultKnowledge: GenericRAGDocument[] = [];
      
      try {
        const knowledgeModule = await import(defaultKnowledgePath);
        defaultKnowledge = knowledgeModule.default || knowledgeModule.defaultKnowledge || [];
      } catch (importError) {
        console.log(`No default knowledge file found for domain: ${this.domainConfig.domain}`);
        defaultKnowledge = this.generateBasicDomainKnowledge();
      }

      // Generate embeddings for all documents
      for (const doc of defaultKnowledge) {
        await this.addDocument(doc);
      }

      console.log(`✅ Loaded ${defaultKnowledge.length} default documents for ${this.domainConfig.domain}`);
    } catch (error) {
      console.error('❌ Failed to load default knowledge:', error);
      throw error;
    }
  }

  /**
   * Generate basic domain knowledge when no default knowledge file exists
   */
  private generateBasicDomainKnowledge(): GenericRAGDocument[] {
    const basicKnowledge: GenericRAGDocument[] = [
      {
        id: `${this.domainConfig.domain}_welcome`,
        content: `Welcome to our ${this.domainConfig.domain} service! We're here to help you find exactly what you need. Feel free to ask any questions about our products and services.`,
        metadata: {
          type: 'greeting',
          category: 'general',
          domain: this.domainConfig.domain,
          priority: 'high' as const,
          lastUpdated: new Date(),
          version: '1.0'
        }
      },
      {
        id: `${this.domainConfig.domain}_help`,
        content: `I can help you with questions about our ${this.domainConfig.domain} products, pricing, features, and recommendations. What would you like to know?`,
        metadata: {
          type: 'help',
          category: 'general',
          domain: this.domainConfig.domain,
          priority: 'medium' as const,
          lastUpdated: new Date(),
          version: '1.0'
        }
      }
    ];

    return basicKnowledge;
  }

  /**
   * Add new document to the knowledge base
   */
  async addDocument(document: GenericRAGDocument): Promise<void> {
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
  async updateKnowledge(newKnowledge: GenericRAGDocument[]): Promise<void> {
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
      // Ensure data directory exists
      const dataDir = path.dirname(this.dataPath);
      await fs.mkdir(dataDir, { recursive: true });

      const data = {
        domain: this.domainConfig.domain,
        documents: this.documents,
        lastUpdated: new Date(),
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
      domain: this.domainConfig.domain,
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

  // Domain-specific detection helper methods

  private isProductQuery(question: string): boolean {
    return ['product', 'item', 'buy', 'purchase', 'features', 'specs'].some(term => 
      question.toLowerCase().includes(term)
    );
  }

  private isTechnicalQuery(question: string): boolean {
    return ['technical', 'specs', 'specification', 'requirements', 'compatibility'].some(term => 
      question.toLowerCase().includes(term)
    );
  }

  private isStyleQuery(question: string): boolean {
    return ['style', 'fashion', 'trend', 'look', 'outfit', 'wear'].some(term => 
      question.toLowerCase().includes(term)
    );
  }

  private detectInsuranceType(question: string): string {
    const lowerQuestion = question.toLowerCase();
    if (lowerQuestion.includes('auto') || lowerQuestion.includes('car')) return 'auto';
    if (lowerQuestion.includes('health') || lowerQuestion.includes('medical')) return 'health';
    if (lowerQuestion.includes('life')) return 'life';
    if (lowerQuestion.includes('business') || lowerQuestion.includes('commercial')) return 'business';
    return 'general';
  }

  private detectDeviceType(question: string): string {
    const lowerQuestion = question.toLowerCase();
    if (lowerQuestion.includes('phone') || lowerQuestion.includes('smartphone')) return 'smartphone';
    if (lowerQuestion.includes('laptop') || lowerQuestion.includes('computer')) return 'laptop';
    if (lowerQuestion.includes('tablet') || lowerQuestion.includes('ipad')) return 'tablet';
    if (lowerQuestion.includes('headphone') || lowerQuestion.includes('audio')) return 'audio';
    if (lowerQuestion.includes('gaming') || lowerQuestion.includes('console')) return 'gaming';
    return 'general';
  }

  private detectClothingType(question: string): string {
    const lowerQuestion = question.toLowerCase();
    if (lowerQuestion.includes('dress')) return 'dresses';
    if (lowerQuestion.includes('shirt') || lowerQuestion.includes('top')) return 'tops';
    if (lowerQuestion.includes('pants') || lowerQuestion.includes('jeans')) return 'bottoms';
    if (lowerQuestion.includes('shoe') || lowerQuestion.includes('boot')) return 'shoes';
    if (lowerQuestion.includes('jacket') || lowerQuestion.includes('coat')) return 'outerwear';
    return 'general';
  }

  private detectOccasion(question: string): string {
    const lowerQuestion = question.toLowerCase();
    if (lowerQuestion.includes('work') || lowerQuestion.includes('office')) return 'professional';
    if (lowerQuestion.includes('party') || lowerQuestion.includes('event')) return 'formal';
    if (lowerQuestion.includes('casual') || lowerQuestion.includes('everyday')) return 'casual';
    if (lowerQuestion.includes('sport') || lowerQuestion.includes('gym')) return 'athletic';
    return 'general';
  }
}

export default GenericRAGService;