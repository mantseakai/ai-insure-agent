// ENHANCED api.ts - Replace your current file with this improved version

import axios, { AxiosResponse } from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Your 60s timeout is good
  headers: {
    'Content-Type': 'application/json',
  },
});

// Enhanced Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`, {
      timestamp: new Date().toISOString(),
      timeout: config.timeout
    });
    return config;
  },
  (error) => {
    console.error('❌ API Request Error:', error);
    return Promise.reject(error);
  }
);

// Enhanced Response interceptor with better error handling
api.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`, {
      timestamp: new Date().toISOString(),
      duration: response.headers['x-response-time'] || 'unknown'
    });
    return response;
  },
  (error) => {
    const timestamp = new Date().toISOString();
    
    // Enhanced error logging
    if (error.code === 'ECONNABORTED') {
      console.error(`⏰ API Timeout Error (${timestamp}):`, {
        url: error.config?.url,
        timeout: error.config?.timeout,
        message: 'Request exceeded timeout limit'
      });
    } else if (error.response) {
      console.error(`🔥 API Response Error (${timestamp}):`, {
        status: error.response.status,
        url: error.config?.url,
        data: error.response.data,
        statusText: error.response.statusText
      });
    } else if (error.request) {
      console.error(`🌐 API Network Error (${timestamp}):`, {
        url: error.config?.url,
        message: 'No response received from server'
      });
    } else {
      console.error(`⚠️ API Setup Error (${timestamp}):`, error.message);
    }
    
    return Promise.reject(error);
  }
);

// Enhanced Chat API with better error handling
export const chatAPI = {
  sendMessage: async (message: string, userId: string, context: any = {}) => {
    const startTime = Date.now();
    console.log(`💬 Sending chat message for user ${userId}:`, {
      messageLength: message.length,
      timestamp: new Date().toISOString()
    });
    
    try {
      const response = await api.post('/chat/message', {
        message,
        userId,
        context
      });
      
      const duration = Date.now() - startTime;
      console.log(`✅ Chat response received in ${duration}ms`);
      
      return response.data;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ Chat API Error after ${duration}ms:`, error);
      
      // Enhanced error handling with specific user messages
      if (error.code === 'ECONNABORTED') {
        throw new Error('The AI is taking longer than usual to process your message. Please try again - your message was not lost.');
      }
      
      if (error.response?.status === 408) {
        throw new Error('Request timed out on the server. The AI might be processing complex analysis. Please try again.');
      }
      
      if (error.response?.status === 429) {
        throw new Error('Too many requests. Please wait a moment before trying again.');
      }
      
      if (error.response?.status >= 500) {
        throw new Error('Server error occurred. Our team has been notified. Please try again in a moment.');
      }
      
      if (error.response?.status === 400) {
        const errorMessage = error.response.data?.error || 'Invalid request format';
        throw new Error(`Request error: ${errorMessage}`);
      }
      
      if (!error.response && error.request) {
        throw new Error('Unable to connect to the server. Please check your internet connection and try again.');
      }
      
      // Fallback error message
      const fallbackMessage = error.response?.data?.error || 
                             error.response?.data?.message || 
                             'An unexpected error occurred. Please try again.';
      throw new Error(fallbackMessage);
    }
  },

  getHistory: async (userId: string) => {
    try {
      const response = await api.get(`/chat/history/${userId}`);
      return response.data;
    } catch (error: any) {
      console.error('❌ Chat History Error:', error);
      
      if (error.code === 'ECONNABORTED') {
        throw new Error('Timeout loading chat history. Please try again.');
      }
      
      throw new Error(error.response?.data?.error || 'Failed to load chat history');
    }
  },

  healthCheck: async () => {
    try {
      const response = await api.get('/chat/health');
      return response.data;
    } catch (error: any) {
      console.error('❌ Health Check Error:', error);
      throw new Error('Service health check failed');
    }
  }
};

// Enhanced Leads API
export const leadsAPI = {
  createLead: async (leadData: any) => {
    try {
      console.log('📋 Creating lead:', { 
        source: leadData.source, 
        userId: leadData.userId,
        timestamp: new Date().toISOString()
      });
      
      const response = await api.post('/leads/capture', leadData);
      
      console.log('✅ Lead created successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Lead Creation Error:', error);
      
      if (error.code === 'ECONNABORTED') {
        throw new Error('Timeout creating lead. Please try again.');
      }
      
      if (error.response?.status === 400) {
        throw new Error(error.response.data?.error || 'Invalid lead data');
      }
      
      throw new Error(error.response?.data?.error || 'Failed to create lead');
    }
  },

  getLead: async (leadId: string) => {
    try {
      const response = await api.get(`/leads/${leadId}`);
      return response.data;
    } catch (error: any) {
      console.error('❌ Get Lead Error:', error);
      
      if (error.response?.status === 404) {
        throw new Error('Lead not found');
      }
      
      throw new Error(error.response?.data?.error || 'Failed to retrieve lead');
    }
  }
};

// Utility function to check API health
export const checkAPIHealth = async (): Promise<boolean> => {
  try {
    await chatAPI.healthCheck();
    return true;
  } catch (error) {
    console.warn('⚠️ API Health Check Failed:', error);
    return false;
  }
};

// Utility function for retry logic
export const withRetry = async <T>(
  operation: () => Promise<T>, 
  maxRetries: number = 2,
  delay: number = 1000
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on client errors (4xx) except 408 (timeout)
      if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 408) {
        throw error;
      }
      
      if (attempt <= maxRetries) {
        console.log(`🔄 Retrying operation (attempt ${attempt + 1}/${maxRetries + 1}) after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; // Exponential backoff
      }
    }
  }
  
  throw lastError;
};

export default api;