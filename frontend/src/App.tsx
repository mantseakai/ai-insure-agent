import React, { useState } from 'react';
import ChatInterface from './components/ChatInterface';
import LeadForm from './components/LeadForm';
import { leadsAPI, chatAPI } from './services/api';

interface Lead {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  source: string;
  score: number;
  nextSteps: string[];
}

function App() {
  const [userId] = useState(() => `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [capturedLead, setCapturedLead] = useState<Lead | null>(null);
  const [chatData, setChatData] = useState<any>(null);
  const [apiTestResult, setApiTestResult] = useState<string>('');

  // Test API connection
  const testAPIConnection = async () => {
    try {
      console.log('🔧 Testing API connection...');
      setApiTestResult('🔄 Testing...');
      
      const healthResponse = await chatAPI.healthCheck();
      console.log('✅ Health check response:', healthResponse);
      setApiTestResult('✅ API Connection: OK');
      
      setTimeout(() => setApiTestResult(''), 3000); // Clear after 3 seconds
    } catch (error) {
      console.error('❌ API test failed:', error);
      setApiTestResult('❌ API Connection: Failed - Check console');
    }
  };

  const handleLeadCapture = (leadData: any) => {
    setChatData(leadData);
    setShowLeadForm(true);
  };

  const handleLeadSubmit = async (formData: any) => {
    try {
      const leadData = {
        ...formData,
        source: 'web_chat',
        userId: userId,
        interests: inferInterests(chatData?.lastMessage || ''),
        urgencyLevel: determineUrgency(chatData?.confidence || 0.5),
        metadata: {
          chatData,
          initialMessage: chatData?.lastMessage,
          aiResponse: chatData?.aiResponse
        }
      };

      const response = await leadsAPI.createLead(leadData);
      
      if (response.success) {
        setCapturedLead(response.data);
        setShowLeadForm(false);
      }
    } catch (error) {
      console.error('Failed to capture lead:', error);
      alert('Failed to capture lead. Please try again.');
    }
  };

  const inferInterests = (message: string): string[] => {
    const interests = [];
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('car') || lowerMessage.includes('auto') || lowerMessage.includes('vehicle')) {
      interests.push('auto');
    }
    if (lowerMessage.includes('health') || lowerMessage.includes('medical') || lowerMessage.includes('hospital')) {
      interests.push('health');
    }
    if (lowerMessage.includes('life') || lowerMessage.includes('family') || lowerMessage.includes('death')) {
      interests.push('life');
    }
    if (lowerMessage.includes('business') || lowerMessage.includes('shop') || lowerMessage.includes('company')) {
      interests.push('business');
    }
    
    return interests;
  };

  const determineUrgency = (confidence: number): 'high' | 'medium' | 'low' => {
    if (confidence > 0.8) return 'high';
    if (confidence > 0.5) return 'medium';
    return 'low';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 1rem' }}>
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">AI</span>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">
                Insurance Assistant
              </h1>
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={testAPIConnection} className="btn-secondary">
                Test API
              </button>
              <div className="text-sm text-gray-500">
                Week 1 MVP Demo
              </div>
            </div>
          </div>
          {apiTestResult && (
            <div className="mb-4 text-sm" style={{ 
              color: apiTestResult.includes('✅') ? '#16a34a' : 
                     apiTestResult.includes('❌') ? '#dc2626' : '#6b7280'
            }}>
              {apiTestResult}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '80rem', margin: '0 auto', padding: '2rem 1rem' }}>
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
          {/* Chat Interface */}
          <div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Chat with AI Assistant
              </h2>
              <ChatInterface 
                userId={userId} 
                onLeadCapture={handleLeadCapture}
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* System Status */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                System Status
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">AI Service</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Online
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">RAG System</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Ready
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Knowledge Base</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    6 Docs
                  </span>
                </div>
              </div>
            </div>

            {/* Current User */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Session Info
              </h3>
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-gray-600">User ID:</span>
                  <span className="ml-2 text-gray-900 font-mono text-xs">
                    {userId.substring(0, 16)}...
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-600">Started:</span>
                  <span className="ml-2 text-gray-900">
                    {new Date().toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>

            {/* API Test Results */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                API Status
              </h3>
              <div className="space-y-2">
                <button onClick={testAPIConnection} className="btn-primary w-full">
                  Test Backend Connection
                </button>
                {apiTestResult && (
                  <div className="text-sm p-2 rounded" style={{ 
                    backgroundColor: apiTestResult.includes('✅') ? '#dcfce7' : 
                                   apiTestResult.includes('❌') ? '#fef2f2' : '#f3f4f6',
                    color: apiTestResult.includes('✅') ? '#16a34a' : 
                           apiTestResult.includes('❌') ? '#dc2626' : '#6b7280'
                  }}>
                    {apiTestResult}
                  </div>
                )}
              </div>
            </div>

            {/* Lead Capture Status */}
            {capturedLead && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Lead Captured!
                </h3>
                <div className="space-y-3">
                  <div className="text-sm">
                    <span className="text-gray-600">Lead ID:</span>
                    <span className="ml-2 text-gray-900 font-mono text-xs">
                      {capturedLead.id}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">Score:</span>
                    <span className="ml-2 text-gray-900 font-semibold">
                      {capturedLead.score}/100
                    </span>
                  </div>
                  <div className="mt-3">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Next Steps:</h4>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {capturedLead.nextSteps.map((step, index) => (
                        <li key={index} className="flex items-start">
                          <span className="mr-2">•</span>
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Features Demo */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Try These Questions
              </h3>
              <div className="space-y-2">
                <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                  "How much does car insurance cost in Ghana?"
                </div>
                <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                  "I think insurance is too expensive"
                </div>
                <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                  "How do I make a claim?"
                </div>
                <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                  "What types of health insurance do you offer?"
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Lead Form Modal */}
      {showLeadForm && (
        <LeadForm
          onSubmit={handleLeadSubmit}
          onCancel={() => setShowLeadForm(false)}
          chatData={chatData}
        />
      )}
    </div>
  );
}

export default App;