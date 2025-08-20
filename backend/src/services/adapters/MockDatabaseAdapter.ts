// backend/src/services/adapters/MockDatabaseAdapter.ts
import { DatabaseAdapter, QueryParams, QueryResult } from './DatabaseAdapter';
import { DomainConfig } from '../../types/domain';

export class MockDatabaseAdapter extends DatabaseAdapter {
  constructor(domainConfig: DomainConfig) {
    super(domainConfig);
  }

  async initialize(): Promise<void> {
    console.log(`🔧 Mock Database Adapter initialized for domain: ${this.domainConfig.domain}`);
    this.connected = true;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async query(queryParams: QueryParams, context?: any): Promise<QueryResult> {
    // Mock data based on domain
    let mockData: any[] = [];
    
    switch (this.domainConfig.domain) {
      case 'insurance':
        mockData = [
          { id: '1', type: 'auto', premium: 1200, coverage: 'comprehensive' },
          { id: '2', type: 'health', premium: 800, coverage: 'basic' },
          { id: '3', type: 'life', premium: 600, coverage: 'term' }
        ];
        break;
      case 'electronics':
        mockData = [
          { id: '1', name: 'Laptop Pro', category: 'laptops', price: 2500, rating: 4.5 },
          { id: '2', name: 'Gaming Phone', category: 'smartphones', price: 800, rating: 4.8 },
          { id: '3', name: 'Wireless Headphones', category: 'audio', price: 200, rating: 4.3 }
        ];
        break;
      case 'fashion':
        mockData = [
          { id: '1', name: 'Business Suit', category: 'formal', price: 300, sizes: ['M', 'L'] },
          { id: '2', name: 'Casual Dress', category: 'casual', price: 80, sizes: ['S', 'M', 'L'] },
          { id: '3', name: 'Running Shoes', category: 'athletic', price: 120, sizes: ['8', '9', '10'] }
        ];
        break;
      default:
        mockData = [{ id: '1', name: 'Sample Product', price: 100 }];
    }

    // Simple filtering based on query params
    let filteredData = mockData;
    if (queryParams.filters) {
      filteredData = mockData.filter(item => {
        return Object.entries(queryParams.filters!).every(([key, value]) => {
          return item[key] === value || (Array.isArray(item[key]) && item[key].includes(value));
        });
      });
    }

    // Apply limit
    if (queryParams.limit) {
      filteredData = filteredData.slice(0, queryParams.limit);
    }

    return {
      data: filteredData,
      total: filteredData.length,
      hasMore: false
    };
  }

  async insert(table: string, data: any): Promise<any> {
    console.log(`Mock insert into ${table}:`, data);
    return { ...data, id: Date.now().toString() };
  }

  async update(table: string, id: string, data: any): Promise<any> {
    console.log(`Mock update ${table}[${id}]:`, data);
    return { ...data, id };
  }

  async delete(table: string, id: string): Promise<boolean> {
    console.log(`Mock delete ${table}[${id}]`);
    return true;
  }
}