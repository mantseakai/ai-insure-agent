// Generic Database Adapter for Multi-Domain Support
// File: backend/src/services/adapters/DatabaseAdapter.ts

import { DomainConfig, DatabaseTableConfig } from '../../types/domain';

export interface QueryParams {
  table: string;
  filters?: Record<string, any>;
  searchQuery?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface QueryResult {
  data: any[];
  total: number;
  page?: number;
  hasMore?: boolean;
}

export abstract class DatabaseAdapter {
  protected domainConfig: DomainConfig;
  protected connected: boolean = false;

  constructor(domainConfig: DomainConfig) {
    this.domainConfig = domainConfig;
  }

  abstract initialize(): Promise<void>;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract query(queryParams: QueryParams, context?: any): Promise<QueryResult>;
  abstract insert(table: string, data: any): Promise<any>;
  abstract update(table: string, id: string, data: any): Promise<any>;
  abstract delete(table: string, id: string): Promise<boolean>;

  /**
   * Validate query parameters against domain configuration
   */
  protected validateQueryParams(queryParams: QueryParams): void {
    const tableConfig = this.domainConfig.databaseConfig.tables[queryParams.table];
    if (!tableConfig) {
      throw new Error(`Table '${queryParams.table}' not configured for domain '${this.domainConfig.domain}'`);
    }

    // Validate filter fields
    if (queryParams.filters) {
      Object.keys(queryParams.filters).forEach(field => {
        if (!tableConfig.filterableFields.includes(field)) {
          throw new Error(`Field '${field}' is not filterable for table '${queryParams.table}'`);
        }
      });
    }

    // Validate sort field
    if (queryParams.sortBy && !Object.keys(tableConfig.fields).includes(queryParams.sortBy)) {
      throw new Error(`Sort field '${queryParams.sortBy}' does not exist in table '${queryParams.table}'`);
    }
  }

  /**
   * Build search conditions based on domain configuration
   */
  protected buildSearchConditions(queryParams: QueryParams): any {
    const tableConfig = this.domainConfig.databaseConfig.tables[queryParams.table];
    const conditions: any = {};

    // Add filters
    if (queryParams.filters) {
      Object.entries(queryParams.filters).forEach(([field, value]) => {
        conditions[field] = value;
      });
    }

    // Add search query conditions
    if (queryParams.searchQuery && tableConfig.searchableFields.length > 0) {
      conditions.$or = tableConfig.searchableFields.map(field => ({
        [field]: { $regex: queryParams.searchQuery, $options: 'i' }
      }));
    }

    return conditions;
  }
}

// PostgreSQL Implementation
export class PostgreSQLAdapter extends DatabaseAdapter {
  private pool: any;

  async initialize(): Promise<void> {
    const { Pool } = require('pg');
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || this.domainConfig.domain,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    await this.connect();
    console.log(`✅ PostgreSQL adapter initialized for domain: ${this.domainConfig.domain}`);
  }

  async connect(): Promise<void> {
    try {
      await this.pool.connect();
      this.connected = true;
    } catch (error) {
      console.error('❌ Failed to connect to PostgreSQL:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
    }
  }

  async query(queryParams: QueryParams, context?: any): Promise<QueryResult> {
    this.validateQueryParams(queryParams);

    let sql = `SELECT * FROM ${queryParams.table}`;
    const values: any[] = [];
    let valueIndex = 1;

    // Build WHERE clause
    const whereClauses: string[] = [];
    
    if (queryParams.filters) {
      Object.entries(queryParams.filters).forEach(([field, value]) => {
        if (Array.isArray(value)) {
          whereClauses.push(`${field} = ANY(${valueIndex})`);
          values.push(value);
        } else {
          whereClauses.push(`${field} = ${valueIndex}`);
          values.push(value);
        }
        valueIndex++;
      });
    }

    if (queryParams.searchQuery) {
      const tableConfig = this.domainConfig.databaseConfig.tables[queryParams.table];
      const searchConditions = tableConfig.searchableFields.map(field => 
        `${field}::text ILIKE ${valueIndex}`
      ).join(' OR ');
      
      if (searchConditions) {
        whereClauses.push(`(${searchConditions})`);
        values.push(`%${queryParams.searchQuery}%`);
        valueIndex++;
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // Add sorting
    if (queryParams.sortBy) {
      sql += ` ORDER BY ${queryParams.sortBy} ${queryParams.sortOrder || 'ASC'}`;
    }

    // Add pagination
    if (queryParams.limit) {
      sql += ` LIMIT ${valueIndex}`;
      values.push(queryParams.limit);
      valueIndex++;
    }

    if (queryParams.offset) {
      sql += ` OFFSET ${valueIndex}`;
      values.push(queryParams.offset);
    }

    try {
      const result = await this.pool.query(sql, values);
      
      // Get total count for pagination
      let totalCount = result.rowCount;
      if (queryParams.limit || queryParams.offset) {
        const countSql = sql.replace(/SELECT \*/, 'SELECT COUNT(*)')
                           .replace(/ORDER BY.*$/, '')
                           .replace(/LIMIT.*$/, '')
                           .replace(/OFFSET.*$/, '');
        const countResult = await this.pool.query(countSql, values.slice(0, -2));
        totalCount = parseInt(countResult.rows[0].count);
      }

      return {
        data: result.rows,
        total: totalCount,
        page: queryParams.offset ? Math.floor(queryParams.offset / (queryParams.limit || 10)) + 1 : 1,
        hasMore: queryParams.limit ? (queryParams.offset || 0) + queryParams.limit < totalCount : false
      };
    } catch (error) {
      console.error('❌ Database query error:', error);
      throw error;
    }
  }

  async insert(table: string, data: any): Promise<any> {
    const tableConfig = this.domainConfig.databaseConfig.tables[table];
    if (!tableConfig) {
      throw new Error(`Table '${table}' not configured`);
    }

    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, index) => `${index + 1}`).join(', ');

    const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`;

    try {
      const result = await this.pool.query(sql, values);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Database insert error:', error);
      throw error;
    }
  }

  async update(table: string, id: string, data: any): Promise<any> {
    const tableConfig = this.domainConfig.databaseConfig.tables[table];
    if (!tableConfig) {
      throw new Error(`Table '${table}' not configured`);
    }

    const fields = Object.keys(data);
    const values = Object.values(data);
    const setClause = fields.map((field, index) => `${field} = ${index + 1}`).join(', ');

    const sql = `UPDATE ${table} SET ${setClause} WHERE ${tableConfig.primaryKey} = ${fields.length + 1} RETURNING *`;
    values.push(id);

    try {
      const result = await this.pool.query(sql, values);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Database update error:', error);
      throw error;
    }
  }

  async delete(table: string, id: string): Promise<boolean> {
    const tableConfig = this.domainConfig.databaseConfig.tables[table];
    if (!tableConfig) {
      throw new Error(`Table '${table}' not configured`);
    }

    const sql = `DELETE FROM ${table} WHERE ${tableConfig.primaryKey} = $1`;

    try {
      const result = await this.pool.query(sql, [id]);
      return result.rowCount > 0;
    } catch (error) {
      console.error('❌ Database delete error:', error);
      throw error;
    }
  }
}

// MongoDB Implementation
export class MongoDBAdapter extends DatabaseAdapter {
  private client: any;
  private db: any;

  async initialize(): Promise<void> {
    const { MongoClient } = require('mongodb');
    
    const connectionString = process.env.MONGODB_URI || 
      `mongodb://localhost:27017/${this.domainConfig.domain}`;
    
    this.client = new MongoClient(connectionString);
    await this.connect();
    console.log(`✅ MongoDB adapter initialized for domain: ${this.domainConfig.domain}`);
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.db = this.client.db(this.domainConfig.domain);
      this.connected = true;
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.connected = false;
    }
  }

  async query(queryParams: QueryParams, context?: any): Promise<QueryResult> {
    this.validateQueryParams(queryParams);

    const collection = this.db.collection(queryParams.table);
    const conditions = this.buildSearchConditions(queryParams);

    try {
      let cursor = collection.find(conditions);

      // Apply sorting
      if (queryParams.sortBy) {
        const sortOrder = queryParams.sortOrder === 'desc' ? -1 : 1;
        cursor = cursor.sort({ [queryParams.sortBy]: sortOrder });
      }

      // Apply pagination
      if (queryParams.offset) {
        cursor = cursor.skip(queryParams.offset);
      }
      if (queryParams.limit) {
        cursor = cursor.limit(queryParams.limit);
      }

      const data = await cursor.toArray();
      const total = await collection.countDocuments(conditions);

      return {
        data,
        total,
        page: queryParams.offset ? Math.floor(queryParams.offset / (queryParams.limit || 10)) + 1 : 1,
        hasMore: queryParams.limit ? (queryParams.offset || 0) + queryParams.limit < total : false
      };
    } catch (error) {
      console.error('❌ MongoDB query error:', error);
      throw error;
    }
  }

  async insert(table: string, data: any): Promise<any> {
    const collection = this.db.collection(table);
    
    try {
      const result = await collection.insertOne(data);
      return { ...data, _id: result.insertedId };
    } catch (error) {
      console.error('❌ MongoDB insert error:', error);
      throw error;
    }
  }

  async update(table: string, id: string, data: any): Promise<any> {
    const collection = this.db.collection(table);
    const tableConfig = this.domainConfig.databaseConfig.tables[table];
    
    const filter = { [tableConfig.primaryKey]: id };
    
    try {
      const result = await collection.findOneAndUpdate(
        filter,
        { $set: data },
        { returnDocument: 'after' }
      );
      return result.value;
    } catch (error) {
      console.error('❌ MongoDB update error:', error);
      throw error;
    }
  }

  async delete(table: string, id: string): Promise<boolean> {
    const collection = this.db.collection(table);
    const tableConfig = this.domainConfig.databaseConfig.tables[table];
    
    const filter = { [tableConfig.primaryKey]: id };
    
    try {
      const result = await collection.deleteOne(filter);
      return result.deletedCount > 0;
    } catch (error) {
      console.error('❌ MongoDB delete error:', error);
      throw error;
    }
  }
}

// Factory function to create appropriate database adapter
export function createDatabaseAdapter(
  domainConfig: DomainConfig, 
  adapterType?: string
): DatabaseAdapter {
  const type = adapterType || process.env.DATABASE_TYPE || 'postgresql';
  
  switch (type.toLowerCase()) {
    case 'postgresql':
    case 'postgres':
      return new PostgreSQLAdapter(domainConfig);
    case 'mongodb':
    case 'mongo':
      return new MongoDBAdapter(domainConfig);
    default:
      throw new Error(`Unsupported database adapter type: ${type}`);
  }
}