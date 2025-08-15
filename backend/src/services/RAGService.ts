import SimpleVectorStore from './SimpleVectorStore';

class RAGService {
  private vectorStore: SimpleVectorStore;
  private companyId: string;

  constructor(companyId: string = 'default') {
    this.companyId = companyId;
    this.vectorStore = new SimpleVectorStore(companyId);
  }

  async initialize(): Promise<void> {
    await this.vectorStore.initialize();
    console.log('RAG Service initialized successfully');
  }

  async queryKnowledge(question: string, context: any = {}) {
    return await this.vectorStore.queryKnowledge(question, context);
  }

  async updateKnowledge(newKnowledge: any[]) {
    return await this.vectorStore.updateKnowledge(newKnowledge);
  }
}

export default RAGService;