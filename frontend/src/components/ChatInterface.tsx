import React, { useState, useRef, useEffect } from 'react';
import { Send, User, MessageCircle } from 'lucide-react';
import { chatAPI } from '../services/api';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  confidence?: number;
}

interface ChatInterfaceProps {
  userId: string;
  onLeadCapture?: (leadData: any) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ userId, onLeadCapture }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Akwaaba! Welcome to our AI Insurance Assistant! 🛡️ I\'m here to help you find the perfect insurance protection. What would you like to know about?',
      sender: 'ai',
      timestamp: new Date(),
      confidence: 1.0
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Manual trigger for testing lead capture
  const handleTestLeadCapture = () => {
    console.log('🧪 Testing lead capture manually...');
    const lastUserMessage = messages.filter(m => m.sender === 'user').pop();
    const lastAiMessage = messages.filter(m => m.sender === 'ai').pop();
    
    onLeadCapture?.({
      userId,
      source: 'web_chat',
      lastMessage: lastUserMessage?.text || 'Manual test trigger',
      aiResponse: lastAiMessage?.text || 'Test AI response',
      confidence: lastAiMessage?.confidence || 0.8,
      triggerReason: 'Manual test button'
    });
  };

  const handleSendMessage = async (e?: React.FormEvent, retryMessage?: string) => {
    if (e) e.preventDefault();
    
    const messageToSend = retryMessage || inputMessage;
    
    if (!messageToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: messageToSend,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInputMessage = messageToSend;
    
    // Only clear input if it's a new message (not a retry)
    if (!retryMessage) {
      setInputMessage('');
    }
    
    setIsLoading(true);
    setError(null);
    setFailedMessage(null);

    try {
      console.log('🚀 Sending message to API:', currentInputMessage);
      
      const response = await chatAPI.sendMessage(currentInputMessage, userId);

      console.log('✅ Received response from API:', response);
      console.log('✅ Full AI Response:', JSON.stringify(response, null, 2));
      console.log('📊 Recommendations:', response.data.recommendations);
      console.log('🎯 Confidence:', response.data.confidence);

      if (response.success) {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: response.data.response,
          sender: 'ai',
          timestamp: new Date(),
          confidence: response.data.confidence
        };

        setMessages(prev => [...prev, aiMessage]);

        // SIMPLIFIED: Trust AI backend analysis over frontend keywords
        let shouldCaptureLead = false;
        let triggerReason = '';

        console.log('🔍 Analyzing AI recommendations from backend...');

        // PRIMARY: Trust your sophisticated AI backend analysis
        const aiRecommendations = response.data.recommendations || [];
        const leadCaptureRecommendation = aiRecommendations.find((r: any) => 
          r.type === 'action' && r.action === 'capture_lead'
        );

        if (leadCaptureRecommendation) {
          shouldCaptureLead = true;
          triggerReason = leadCaptureRecommendation.reason || 'AI backend recommendation';
          console.log('🎯 Lead capture triggered by AI backend analysis:', {
            reason: leadCaptureRecommendation.reason,
            confidence: leadCaptureRecommendation.confidence,
            aiAnalysis: leadCaptureRecommendation.aiAnalysis
          });
        } else {
          console.log('ℹ️ AI backend analysis suggests no lead capture needed');
          console.log('📊 Available recommendations:', aiRecommendations.map((r: any) => r.type + ':' + r.action).join(', ') || 'none');
        }

        // Trigger lead capture based on AI backend analysis
        if (shouldCaptureLead) {
          console.log(`🎯 TRIGGERING AI-POWERED LEAD CAPTURE: ${triggerReason}`);
          
          const userMessages = messages.filter(m => m.sender === 'user');
          const leadData = {
            userId,
            source: 'ai_powered_web_chat',
            lastMessage: currentInputMessage,
            aiResponse: response.data.response,
            confidence: response.data.confidence,
            triggerReason,
            conversationLength: userMessages.length + 1,
            aiRecommendation: leadCaptureRecommendation,
            timestamp: new Date().toISOString()
          };

          console.log('📋 AI-powered lead data being sent:', leadData);

          onLeadCapture?.(leadData);
        } else {
          console.log('ℹ️ AI analysis determined no lead capture needed for this interaction');
        }

        // Check for other recommendation actions
        if (response.data.recommendations) {
          response.data.recommendations.forEach((rec: any) => {
            console.log(`📋 Recommendation: ${rec.type} - ${rec.action || rec.category} (${rec.reason || rec.reasoning})`);
          });
        }

      } else {
        throw new Error(response.error || 'Failed to get response');
      }

    } catch (error: any) {
      console.error('❌ Chat error:', error);
      
      // Enhanced error handling with specific user feedback
      let errorMsgText = 'Failed to send message. Please try again.';
      let shouldShowRetry = true;
      
      if (error.message.includes('timeout') || error.message.includes('longer than usual')) {
        errorMsgText = 'The AI is processing your request (this may take a moment). Please try again.';
      } else if (error.message.includes('server error')) {
        errorMsgText = 'Server issue detected. Please try again in a moment.';
      } else if (error.message.includes('internet connection')) {
        errorMsgText = 'Connection issue. Please check your internet and try again.';
      } else if (error.message.includes('Too many requests')) {
        errorMsgText = 'Please wait a moment before sending another message.';
        shouldShowRetry = false; // Don't show retry for rate limiting
        setTimeout(() => {
          setError(null);
          setFailedMessage(null);
        }, 5000); // Clear error after 5 seconds
      }
      
      setError(errorMsgText);
      if (shouldShowRetry) {
        setFailedMessage(currentInputMessage);
      }
      
      const errorMessageObj: Message = {
        id: (Date.now() + 1).toString(),
        text: 'I apologize, but I\'m having technical difficulties. Please try your message again, or let me know if you\'d like to speak with a human agent.',
        sender: 'ai',
        timestamp: new Date(),
        confidence: 0.1
      };

      setMessages(prev => [...prev, errorMessageObj]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetryMessage = () => {
    if (failedMessage) {
      handleSendMessage(undefined, failedMessage);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e as any);
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-white border border-gray-200 rounded-lg shadow-lg w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 rounded-t-lg bg-blue-50">
        <div className="flex items-center space-x-2">
          <MessageCircle className="h-5 w-5 text-blue-600" />
          <h3 className="text-sm font-medium text-gray-900">Insurance Assistant</h3>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={handleTestLeadCapture}
            className="text-xs bg-yellow-100 hover:bg-yellow-200 px-2 py-1 rounded border text-yellow-800 transition-colors"
            title="Test lead capture manually"
          >
            🧪 Test Lead
          </button>
          <div className="flex items-center space-x-1">
            <div className="h-2 w-2 bg-green-400 rounded-full"></div>
            <span className="text-xs text-gray-500">Online</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex w-full ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex space-x-3 max-w-[75%] ${message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                message.sender === 'user' ? 'bg-blue-600' : 'bg-gray-300'
              }`}>
                {message.sender === 'user' ? (
                  <User className="h-4 w-4 text-white" />
                ) : (
                  <span className="text-sm font-medium text-gray-700">AI</span>
                )}
              </div>
              <div className="flex flex-col space-y-1">
                <div className={`px-4 py-3 rounded-lg ${
                  message.sender === 'user' 
                    ? 'bg-blue-600 text-white rounded-br-sm' 
                    : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>
                </div>
                <div className={`text-xs px-1 ${
                  message.sender === 'user' ? 'text-right text-gray-500' : 'text-left text-gray-500'
                }`}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {message.confidence !== undefined && message.sender === 'ai' && (
                    <span className="ml-2">
                      ({Math.round(message.confidence * 100)}% confident)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start w-full">
            <div className="flex space-x-3 max-w-[75%]">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
                <span className="text-sm font-medium text-gray-700">AI</span>
              </div>
              <div className="flex flex-col space-y-1">
                <div className="px-4 py-3 bg-white border border-gray-200 rounded-lg rounded-bl-sm">
                  <div className="flex space-x-1">
                    <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.1s]"></div>
                    <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Error Message with Retry */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border-t border-red-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-600">{error}</p>
            {failedMessage && (
              <button
                onClick={handleRetryMessage}
                disabled={isLoading}
                className="text-sm bg-red-100 hover:bg-red-200 disabled:bg-gray-100 disabled:text-gray-400 text-red-700 px-3 py-1 rounded border transition-colors"
              >
                Retry
              </button>
            )}
          </div>
          {failedMessage && (
            <div className="mt-2 p-2 bg-red-100 rounded text-sm text-red-800">
              <span className="font-medium">Failed message:</span> "{failedMessage}"
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-white rounded-b-lg">
        <div className="space-y-2">
          <div className="flex space-x-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Try: 'How much does car insurance cost?' or 'I want a quote'"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center min-w-[44px]"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Press Enter to send • AI-driven lead capture based on intent analysis (not keywords)
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;