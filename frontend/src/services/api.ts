// ENHANCED api.ts - Includes all your existing functionality + Generic Agent Support
// Replace your current frontend/src/services/api.ts with this version

import axios, { AxiosResponse } from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Your existing 60s timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Enhanced Request interceptor (your existing enhanced logging)
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

// Enhanced Response interceptor (your existing enhanced error handling)
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
    
    // Your existing enhanced error logging
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

// Enhanced Chat API with Generic Agent Support
export const chatAPI = {
  // EXISTING: Original endpoint with your exact error handling logic
  sendMessage: async (message: string, userId: string, context: any = {}) => {
    const startTime = Date.now();
    console.log(`💬 Sending message to ORIGINAL agent for user ${userId}:`, {
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
      console.log(`✅ Original agent response received in ${duration}ms`);
      
      return response.data;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ Original Agent API Error after ${duration}ms:`, error);
      
      // Your existing enhanced error handling with specific user messages
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

  // NEW: Generic agent endpoint with same error handling
  sendMessageGeneric: async (message: string, userId: string, domain: string = 'insurance', context: any = {}) => {
    const startTime = Date.now();
    console.log(`💬 Sending message to GENERIC ${domain} agent for user ${userId}:`, {
      messageLength: message.length,
      timestamp: new Date().toISOString()
    });
    
    try {
      const response = await api.post(`/generic/${domain}/message`, {
        message,
        userId,
        context: {
          ...context,
          domain // Ensure domain is set
        }
      });
      
      const duration = Date.now() - startTime;
      console.log(`✅ Generic ${domain} agent response received in ${duration}ms`);
      
      return response.data;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ Generic ${domain} Agent API Error after ${duration}ms:`, error);
      
      // Same error handling as original agent
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

  // NEW: Agent comparison
  compareAgents: async (message: string, userId: string, context: any = {}) => {
    const startTime = Date.now();
    console.log(`🔄 Comparing agents for message: "${message.substring(0, 50)}..."`);
    
    try {
      const response = await api.post('/generic/insurance/compare', {
        message,
        userId: `compare_${Date.now()}`,
        context
      });
      
      const duration = Date.now() - startTime;
      console.log(`✅ Agent comparison completed in ${duration}ms`);
      
      return response.data;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ Agent Comparison Error after ${duration}ms:`, error);
      
      // Same error handling pattern
      if (error.code === 'ECONNABORTED') {
        throw new Error('Agent comparison is taking longer than usual. Please try again.');
      }
      
      throw new Error(error.response?.data?.error || 'Failed to compare agents');
    }
  },

  // NEW: Agent status check
  getAgentStatus: async () => {
    try {
      const response = await api.get('/agents/status');
      return response.data;
    } catch (error: any) {
      console.error('❌ Agent Status Error:', error);
      throw new Error('Failed to get agent status');
    }
  },

  // EXISTING: Chat history (unchanged)
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

  // EXISTING: Health check (unchanged)
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

// Enhanced Leads API (keeps your existing functionality)
export const leadsAPI = {
  createLead: async (leadData: any) => {
    try {
      console.log('📋 Creating lead:', { 
        source: leadData.source, 
        userId: leadData.userId,
        agent: leadData.agent || 'unknown', // Track which agent generated the lead
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

  // EXISTING: Get lead (your existing function)
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

// EXISTING: Your utility functions (unchanged)
export const checkAPIHealth = async (): Promise<boolean> => {
  try {
    await chatAPI.healthCheck();
    return true;
  } catch (error) {
    console.warn('⚠️ API Health Check Failed:', error);
    return false;
  }
};

// EXISTING: Your retry logic (unchanged - this is important!)
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

// NEW: Utility function to use retry logic with agent calls
export const sendMessageWithRetry = async (
  message: string, 
  userId: string, 
  agent: 'original' | 'generic' = 'original',
  domain: string = 'insurance',
  context: any = {}
) => {
  return withRetry(async () => {
    return agent === 'generic' 
      ? await chatAPI.sendMessageGeneric(message, userId, domain, context)
      : await chatAPI.sendMessage(message, userId, context);
  });
};

export default api;