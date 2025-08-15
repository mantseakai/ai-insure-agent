import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';

interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    type: 'product' | 'objection' | 'process' | 'market_context';
    category?: string;
    companyId: string;
    lastUpdated: Date;
  };
}

interface RAGDocument {
  id: string;
  content: string;
  metadata: {
    type: 'product' | 'objection' | 'process' | 'market_context';
    category?: string;
    companyId: string;
    lastUpdated: Date;
  };
}

interface RAGQueryResult {
  documents: RAGDocument[];
  context: string;
  confidence: number;
  metadata: {
    hasProductInfo: boolean;
    hasObjectionHandling: boolean;
    hasMarketContext: boolean;
  };
}

class SimpleVectorStore {
  private openai: OpenAI | null = null;
  private documents: VectorDocument[] = [];
  private knowledgeCache: Map<string, any> = new Map();
  private initialized = false;
  private companyId: string;
  private dataPath: string;

  constructor(companyId: string = 'default') {
    this.companyId = companyId;
    this.dataPath = path.join(process.cwd(), 'data', `knowledge_${companyId}.json`);
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

  async initialize(): Promise<void> {
    console.log(`Initializing Simple Vector Store for company ${this.companyId}`);
    
    try {
      // Create data directory if it doesn't exist
      await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
      
      // Try to load existing data
      try {
        const data = await fs.readFile(this.dataPath, 'utf-8');
        const parsed = JSON.parse(data);
        this.documents = parsed.documents || [];
        console.log(`Loaded ${this.documents.length} existing documents`);
      } catch {
        // File doesn't exist, load sample data
        console.log('No existing data found, loading sample knowledge...');
        await this.loadSampleKnowledge();
      }
      
      this.initialized = true;
      console.log('Simple Vector Store initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Simple Vector Store:', error);
      throw error;
    }
  }

  private async loadSampleKnowledge(): Promise<void> {
    const sampleDocuments: RAGDocument[] = [
      {
        id: 'auto_insurance_basic',
        content: `Auto insurance in Ghana: Comprehensive coverage includes accident damage, theft protection, third-party liability, and roadside assistance. Prices start from GH₵ 200/month. Payment via MTN MoMo, Vodafone Cash, or bank transfer. Covers vehicles 0-15 years old with valid Ghana license.`,
        metadata: {
          type: 'product',
          category: 'auto',
          companyId: this.companyId,
          lastUpdated: new Date()
        }
      },
      {
        id: 'health_insurance_basic',
        content: `Health insurance Ghana: Supplements NHIS with private hospital access, international coverage, dental and vision care. Covers Ridge Hospital, Trust Hospital, and medical tourism. From GH₵ 150/month. Includes emergency evacuation and specialist consultations.`,
        metadata: {
          type: 'product',
          category: 'health',
          companyId: this.companyId,
          lastUpdated: new Date()
        }
      },
      {
        id: 'life_insurance_basic',
        content: `Life insurance Ghana: Protects family financial future. Term life from GH₵ 50/month covers up to GH₵ 500,000. Whole life includes savings component. Popular for school fees protection and mortgage coverage. Quick approval with minimal paperwork.`,
        metadata: {
          type: 'product',
          category: 'life',
          companyId: this.companyId,
          lastUpdated: new Date()
        }
      },
      {
        id: 'objection_expensive',
        content: `Common objection - too expensive: Our policies cost less than daily transport! Auto insurance GH₵ 6.50/day vs potential GH₵ 50,000+ accident costs. Health insurance GH₵ 5/day vs GH₵ 20,000+ hospital bills. We offer flexible payment plans and family discounts.`,
        metadata: {
          type: 'objection',
          category: 'price',
          companyId: this.companyId,
          lastUpdated: new Date()
        }
      },
      {
        id: 'claims_process',
        content: `Claims process Ghana: WhatsApp photo → AI assessment → Approval → Mobile Money payment. 90% of claims paid within 24 hours. No long forms, no office visits required. 24/7 claims hotline available. Track claim status via SMS.`,
        metadata: {
          type: 'process',
          category: 'claims',
          companyId: this.companyId,
          lastUpdated: new Date()
        }
      },
      {
        id: 'ghana_market_context',
        content: `Ghana market context: Common risks include Accra traffic accidents, Harmattan dust damage, flood damage, theft in urban areas. Cultural factors: family responsibility, community trust. Payment preferences: MTN MoMo (60%), Vodafone Cash (25%), bank transfer (15%). Languages: English, Twi, Ga, Ewe.`,
        metadata: {
          type: 'market_context',
          companyId: this.companyId,
          lastUpdated: new Date()
        }
      }
    ];

    // Add documents with embeddings
    for (const doc of sampleDocuments) {
      await this.addDocument(doc);
    }

    // Save to file
    await this.saveToFile();
    console.log(`Loaded ${sampleDocuments.length} sample documents to knowledge base`);
  }

  private async addDocument(doc: RAGDocument): Promise<void> {
    try {
      // Generate embedding for the document content
      const embedding = await this.generateEmbedding(doc.content);
      
      // Add to documents array
      this.documents.push({
        ...doc,
        embedding
      });
    } catch (error) {
      console.error(`Failed to add document ${doc.id}:`, error);
      throw error;
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      this.initializeOpenAI();
    }

    try {
      const response = await this.openai!.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  async queryKnowledge(question: string, context: any = {}): Promise<RAGQueryResult> {
    if (!this.initialized) await this.initialize();

    try {
      // Build enhanced query with context
      const enhancedQuery = this.buildContextualQuery(question, context);
      
      // Check cache first
      const cacheKey = `${enhancedQuery}_${JSON.stringify(context)}`;
      if (this.knowledgeCache.has(cacheKey)) {
        return this.knowledgeCache.get(cacheKey);
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
      const topResults = similarities.slice(0, 5).filter(result => result.similarity > 0.5);

      // Convert to RAGDocument format
      const relevantDocs: RAGDocument[] = topResults.map(result => ({
        id: result.document.id,
        content: result.document.content,
        metadata: result.document.metadata
      }));

      const result: RAGQueryResult = {
        documents: relevantDocs,
        context: this.buildResponseContext(relevantDocs),
        confidence: this.calculateConfidence(relevantDocs, question),
        metadata: this.extractActionableMetadata(relevantDocs)
      };

      // Cache result
      this.knowledgeCache.set(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('Failed to query knowledge:', error);
      throw error;
    }
  }

  private buildContextualQuery(question: string, context: any): string {
    let enhancedQuery = question;
    
    if (context.productType) enhancedQuery += ` ${context.productType} insurance`;
    if (context.leadSource) enhancedQuery += ` ${context.leadSource} customer`;
    if (context.stage) enhancedQuery += ` ${context.stage} conversation`;
    if (context.budget) enhancedQuery += ` budget ${context.budget}`;
    
    return enhancedQuery;
  }

  private buildResponseContext(documents: RAGDocument[]): string {
    return documents.map(doc => doc.content).join('\n\n------\n\n');
  }

  private calculateConfidence(documents: RAGDocument[], question: string): number {
    if (documents.length === 0) return 0.2;
    if (documents.length >= 3) return 0.95;
    if (documents.length === 2) return 0.8;
    return 0.6;
  }

  private extractActionableMetadata(documents: RAGDocument[]): any {
    return {
      productTypes: [...new Set(documents.map(d => d.metadata.category).filter(Boolean))],
      hasObjectionHandling: documents.some(d => d.metadata.type === 'objection'),
      hasProductInfo: documents.some(d => d.metadata.type === 'product'),
      hasMarketContext: documents.some(d => d.metadata.type === 'market_context'),
      confidence: documents.length > 0 ? 'high' : 'low'
    };
  }

  private async saveToFile(): Promise<void> {
    try {
      const data = {
        documents: this.documents,
        lastUpdated: new Date(),
        companyId: this.companyId
      };
      await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save data to file:', error);
    }
  }

  async updateKnowledge(newKnowledge: RAGDocument[]): Promise<void> {
    if (!this.initialized) await this.initialize();
    
    for (const doc of newKnowledge) {
      await this.addDocument(doc);
    }
    
    // Save to file
    await this.saveToFile();
    
    // Clear cache to ensure fresh responses
    this.knowledgeCache.clear();
    console.log(`Knowledge base updated with ${newKnowledge.length} new documents`);
  }
}

export default SimpleVectorStore;