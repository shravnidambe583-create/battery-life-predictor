import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, Battery, BatteryCharging, BatteryWarning,
  Clock, Database, Download, FileText, Mic, MicOff, Moon, Play, RefreshCw, 
  Send, Sun, Trash2, User, Volume2, VolumeX, ShieldAlert, Sparkles, MessageSquare,
  BarChart2, BookOpen, UserCheck, Calendar
} from 'lucide-react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceDot, Line, ComposedChart } from 'recharts';

export default function App() {
  // App States
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('predictor');
  const [theme, setTheme] = useState('dark');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Model & Prediction States
  const [screenTime, setScreenTime] = useState('4.5');
  const [prediction, setPrediction] = useState(null);
  const [modelStats, setModelStats] = useState(null);
  const [scatterData, setScatterData] = useState([]);
  const [regressionData, setRegressionData] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [predicting, setPredicting] = useState(false);
  
  // History & Export States
  const [history, setHistory] = useState([]);
  
  // Voice States
  const [isListening, setIsListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  
  // Chatbot Assistant States
  const [chatMessages, setChatMessages] = useState([
    { sender: 'bot', text: 'Hello! I am your VoltPredict AI Assistant. Ask me how to increase battery life, or inquire about the linear regression formula!' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [botTyping, setBotTyping] = useState(false);

  const chatEndRef = useRef(null);

  // --- 1. Clock & Startup Loader Effect ---
  useEffect(() => {
    // Realtime digital clock update
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    // Simulate loading progress
    const progressTimer = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressTimer);
          setTimeout(() => setLoading(false), 300);
          return 100;
        }
        return prev + 10;
      });
    }, 150);

    // Load history from Local Storage
    const savedHistory = localStorage.getItem('voltpredict_history');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }

    return () => {
      clearInterval(timer);
      clearInterval(progressTimer);
    };
  }, []);

  // --- 2. Fetch Initial API Data ---
  useEffect(() => {
    fetchStats();
    fetchChartData();
  }, []);

  // Trigger default prediction once loading is done and stats are loaded
  useEffect(() => {
    if (!loading && scatterData.length > 0) {
      executePrediction(parseFloat(screenTime));
    }
  }, [loading, scatterData]);

  // Scroll chatbot history to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, botTyping]);

  // --- 3. API Handlers ---
  const fetchStats = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/stats');
      const data = await response.json();
      if (data.success) {
        setModelStats(data);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  };

  const fetchChartData = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/chart-data');
      const data = await response.json();
      if (data.success) {
        setScatterData(data.scatter);
        setRegressionData(data.regression);
      }
    } catch (err) {
      console.error("Error fetching chart data:", err);
    }
  };

  const executePrediction = async (val) => {
    if (isNaN(val) || val < 0 || val > 24) {
      setErrorMsg("Please enter screen hours between 0 and 24.");
      return;
    }
    setErrorMsg('');
    setPredicting(true);
    
    try {
      const response = await fetch('http://localhost:5001/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screen_time_hours: val })
      });
      const data = await response.json();
      
      if (data.success) {
        setPrediction(data);
        
        // Save to Local Storage & Update Local State History
        const newEntry = {
          id: Date.now(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          screen_time_hours: val,
          predicted_battery_percent_clamped: data.predicted_battery_percent_clamped,
          health_status: data.health_status
        };
        
        setHistory(prev => {
          const updated = [newEntry, ...prev].slice(0, 30); // Clip top 30
          localStorage.setItem('voltpredict_history', JSON.stringify(updated));
          return updated;
        });

        // Trigger TTS voice read-out if enabled
        if (ttsEnabled) {
          speakResult(data.predicted_battery_percent_clamped, data.health_status);
        }
      } else {
        setErrorMsg(data.error || "Prediction request failed.");
      }
    } catch (err) {
      console.error("Prediction error:", err);
      setErrorMsg("Could not establish connection to the Flask ML Server.");
    } finally {
      setPredicting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executePrediction(parseFloat(screenTime));
  };

  // --- 4. Voice Input (Speech Recognition) ---
  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support Speech Recognition. Try Google Chrome.");
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    setIsListening(true);
    recognition.start();
    
    recognition.onresult = (event) => {
      const speechToText = event.results[0][0].transcript.toLowerCase();
      setIsListening(false);
      
      // Parse speech text for screen time hours
      // e.g. "predict battery for 5 hours", "4.5 hours", "predict 6 hours"
      const numberMatches = speechToText.match(/[-+]?[0-9]*\.?[0-9]+/);
      if (numberMatches) {
        const parsedHours = parseFloat(numberMatches[0]);
        if (parsedHours >= 0 && parsedHours <= 24) {
          setScreenTime(parsedHours.toString());
          executePrediction(parsedHours);
          
          // Conversational chatbot response
          addChatbotMessage('user', `Voice Command: Predict for ${parsedHours} hours`);
          addChatbotMessage('bot', `Analyzing battery behavior for ${parsedHours} hours of active screen time...`);
        } else {
          setErrorMsg("Voice parsing detected screen hours out of range (0-24).");
        }
      } else {
        addChatbotMessage('user', `Voice input: "${speechToText}"`);
        addChatbotMessage('bot', "I couldn't identify a valid number of screen hours in your statement. Please try saying: 'predict battery for 5 hours'.");
      }
    };
    
    recognition.onerror = (e) => {
      console.error("Speech recognition error:", e);
      setIsListening(false);
    };
  };

  // --- 5. Voice Output (TTS) ---
  const speakResult = (batteryLevel, health) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // Stop any active speaker
    const text = `Predicted remaining battery is ${batteryLevel} percent. System status is classified as ${health}.`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  // --- 6. Chatbot Assistant Response Engine ---
  const addChatbotMessage = (sender, text) => {
    setChatMessages(prev => [...prev, { sender, text }]);
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const userQuery = chatInput;
    addChatbotMessage('user', userQuery);
    setChatInput('');
    setBotTyping(true);
    
    try {
      const response = await fetch('http://localhost:5001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userQuery })
      });
      const data = await response.json();
      
      if (data.success) {
        addChatbotMessage('bot', data.reply);
        
        // If the query triggered a prediction, sync it with the main dashboard inputs and trigger visual calculations
        if (data.screen_time !== undefined) {
          setScreenTime(data.screen_time.toString());
          executePrediction(data.screen_time);
        }
      } else {
        addChatbotMessage('bot', "My AI core experienced an error parsing that request. Please try another query.");
      }
    } catch (err) {
      console.error("Chatbot query error:", err);
      addChatbotMessage('bot', "Mainframe offline. I'm unable to connect to the real-time Flask ML server.");
    } finally {
      setBotTyping(false);
    }
  };

  // --- 7. History Exporters (CSV & PDF) ---
  const exportToCSV = () => {
    if (history.length === 0) {
      alert("No prediction history logged yet.");
      return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Timestamp,Screen Time (Hours),Predicted Battery (%)\n";
    
    history.forEach(item => {
      csvContent += `${item.timestamp},${item.screen_time_hours},${item.predicted_battery_percent_clamped}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "VoltPredict_History_Log.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPDFReport = async () => {
    try {
      const payload = {
        history: history,
        current: prediction
      };
      
      const response = await fetch('http://localhost:5001/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'VoltPredict_AI_Report.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        alert("Failed to export PDF report from backend.");
      }
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("Connection failure while generating PDF.");
    }
  };

  const clearLocalHistory = () => {
    if (confirm("Clear local prediction logs?")) {
      setHistory([]);
      localStorage.removeItem('voltpredict_history');
    }
  };

  // --- 8. Theme Switcher Trigger ---
  const toggleTheme = (targetTheme) => {
    setTheme(targetTheme);
    if (targetTheme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  };

  // Custom Tooltip component for Recharts Composed Graph
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="custom-recharts-tooltip">
          <p><strong>Screen Hours:</strong> {data.x} hrs</p>
          <p><strong>Battery Level:</strong> {data.y}%</p>
        </div>
      );
    }
    return null;
  };

  // --- 9. Render Loading Screen ---
  if (loading) {
    return (
      <div className="loader-screen">
        <div className="loader-ai-circle">
          <div className="loader-ai-core"></div>
        </div>
        <div className="loader-text">VoltPredict AI Core Initializing</div>
        <div className="loader-progress">
          <div className="loader-bar" style={{ width: `${loadingProgress}%` }}></div>
        </div>
        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Setting up linear regression models...</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Dynamic Background Blur Blobs */}
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">
            <Sparkles size={20} />
          </div>
          <h2>VoltPredict AI</h2>
        </div>

        <nav class="sidebar-nav">
          <button 
            className={`nav-btn ${activeTab === 'predictor' ? 'active' : ''}`} 
            onClick={() => setActiveTab('predictor')}
          >
            <Activity size={18} />
            <span>AI Predictor</span>
          </button>
          <button 
            className={`nav-btn ${activeTab === 'analytics' ? 'active' : ''}`} 
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart2 size={18} />
            <span>Model Analytics</span>
          </button>
          <button 
            className={`nav-btn ${activeTab === 'chatbot' ? 'active' : ''}`} 
            onClick={() => setActiveTab('chatbot')}
          >
            <MessageSquare size={18} />
            <span>AI Assistant</span>
          </button>
          <button 
            className={`nav-btn ${activeTab === 'explorer' ? 'active' : ''}`} 
            onClick={() => setActiveTab('explorer')}
          >
            <Database size={18} />
            <span>Data Explorer</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          {/* Theme switcher */}
          <div className="theme-switch">
            <span>Interface Mode</span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button 
                className={`theme-btn ${theme === 'light' ? 'active' : ''}`} 
                onClick={() => toggleTheme('light')}
              >
                <Sun size={14} />
              </button>
              <button 
                className={`theme-btn ${theme === 'dark' ? 'active' : ''}`} 
                onClick={() => toggleTheme('dark')}
              >
                <Moon size={14} />
              </button>
            </div>
          </div>
          <div className="stat-pill">
            <span className="dot green"></span>
            <span>ML Engine Active</span>
          </div>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="main-dashboard">
        <header className="top-bar">
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase' }}>
              AI Predictive Core
            </span>
            <h1 style={{ textTransform: 'capitalize' }}>
              {activeTab === 'predictor' && "Futuristic Dashboard"}
              {activeTab === 'analytics' && "Linear Regression Fit"}
              {activeTab === 'chatbot' && "Conversational Battery Support"}
              {activeTab === 'explorer' && "Mobile Testing Dataset"}
            </h1>
          </div>
          
          {/* Clock & Date Widget */}
          <div className="clock-widget">
            <span className="clock-time">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="clock-date">
              {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </header>

        {/* Dynamic Alerts for Low Battery predictions */}
        {prediction && prediction.predicted_battery_percent_clamped < 20.0 && activeTab === 'predictor' && (
          <div className="glass-card" style={{ background: 'rgba(239, 68, 68, 0.08)', borderColor: 'var(--color-danger)', display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', padding: '1rem 1.5rem' }}>
            <ShieldAlert style={{ color: 'var(--color-danger)' }} size={24} />
            <div>
              <strong style={{ color: 'var(--color-danger)' }}>Warning: Low Remaining Battery Predicted!</strong>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>The model predicts battery will fall to {prediction.predicted_battery_percent_clamped}% within screen window.</p>
            </div>
          </div>
        )}

        {/* TAB 1: PREDICTOR DASHBOARD */}
        {activeTab === 'predictor' && (
          <>
            {/* Row 1 Stats Overview Cards */}
            <div className="dashboard-row-3col">
              <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Average Battery</span>
                    <h3 style={{ fontSize: '1.8rem', fontWeight: '800', marginTop: '0.25rem', fontFamily: 'var(--font-heading)' }}>
                      {modelStats ? `${modelStats.avg_battery}%` : '--%'}
                    </h3>
                  </div>
                  <div style={{ padding: '0.5rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)', borderRadius: '10px' }}>
                    <Battery size={20} />
                  </div>
                </div>
              </div>
              <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dataset Records</span>
                    <h3 style={{ fontSize: '1.8rem', fontWeight: '800', marginTop: '0.25rem', fontFamily: 'var(--font-heading)' }}>
                      {modelStats ? `${modelStats.count}` : '--'}
                    </h3>
                  </div>
                  <div style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-primary)', borderRadius: '10px' }}>
                    <Database size={20} />
                  </div>
                </div>
              </div>
              <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Model Fit Confidence (R²)</span>
                    <h3 style={{ fontSize: '1.8rem', fontWeight: '800', marginTop: '0.25rem', fontFamily: 'var(--font-heading)' }}>
                      {modelStats ? `${modelStats.r2_score}` : '--'}
                    </h3>
                  </div>
                  <div style={{ padding: '0.5rem', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)', borderRadius: '10px' }}>
                    <Activity size={20} />
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2 Main Prediction Column */}
            <div className="dashboard-grid">
              {/* Left Column: Input Form + Coefficients */}
              <div className="glass-card">
                <div className="card-header">
                  <div className="icon-wrap">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3>AI Predictor Inputs</h3>
                    <p>Parameters to calculate battery remaining values.</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
                  <div className="form-group">
                    <label>Active Screen Time (Hours)</label>
                    <div className="input-wrapper">
                      <Clock className="input-icon" size={18} />
                      <input 
                        type="number" 
                        step="0.01"
                        min="0" 
                        max="24"
                        className="form-input"
                        value={screenTime} 
                        onChange={(e) => setScreenTime(e.target.value)}
                        required 
                      />
                      <span className="input-suffix">hrs</span>
                    </div>
                  </div>

                  {errorMsg && (
                    <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                      {errorMsg}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button type="submit" className="btn-act" disabled={predicting}>
                      {predicting ? "Running ML Model..." : "Calculate AI Prediction"}
                    </button>
                    
                    {/* Voice command button */}
                    <button 
                      type="button" 
                      onClick={handleVoiceInput} 
                      className={`btn-icon ${isListening ? 'active' : ''}`}
                      title="Speech Recognition"
                    >
                      {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>

                    {/* Speech output setting toggle */}
                    <button 
                      type="button" 
                      onClick={() => setTtsEnabled(!ttsEnabled)} 
                      className="btn-icon"
                      title={ttsEnabled ? "Voice Output Active" : "Voice Output Silenced"}
                      style={{ borderColor: ttsEnabled ? 'var(--color-success)' : '' }}
                    >
                      {ttsEnabled ? <Volume2 size={18} style={{ color: 'var(--color-success)' }} /> : <VolumeX size={18} />}
                    </button>
                  </div>
                </form>

                {/* Substituted equation Display */}
                {prediction && (
                  <div style={{ marginTop: '2rem', borderTop: '1px solid var(--card-border)', paddingTop: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Linear Equation Substitution</h4>
                    <div style={{ fontFamily: 'monospace', padding: '1rem', background: 'rgba(0,0,0,0.2)', border: '1px dashed rgba(16,185,129,0.2)', borderRadius: '10px', textAlign: 'center', fontSize: '1.05rem', color: 'var(--color-success)' }}>
                      y = {modelStats?.intercept} + ({modelStats?.slope}) * {prediction.screen_time} = {prediction.predicted_battery_percent_raw}%
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Battery Visual Meter */}
              <div className="glass-card battery-gauge-card">
                <div style={{ width: '100%' }}>
                  <div className="card-header">
                    <div className="icon-wrap">
                      <BatteryCharging size={18} />
                    </div>
                    <div>
                      <h3>Predicted Output Gauge</h3>
                      <p>Visual output and health analytics.</p>
                    </div>
                  </div>
                </div>

                <div className="battery-display-container">
                  <div className="battery-frame">
                    <div className="battery-top-cap"></div>
                    <div className="battery-inside">
                      <div className="battery-text">
                        {prediction ? `${prediction.predicted_battery_percent_clamped}%` : '--%'}
                      </div>
                      <div 
                        className="battery-level" 
                        style={{ 
                          height: prediction ? `${prediction.predicted_battery_percent_clamped}%` : '0%',
                          background: prediction ? prediction.health_color : '#3b82f6',
                          boxShadow: prediction ? `0 0 20px ${prediction.health_color}` : 'none'
                        }}
                      >
                        {/* CSS Bubbles inside battery fill */}
                        <div className="battery-bubble bubble-1"></div>
                        <div className="battery-bubble bubble-2"></div>
                        <div className="battery-bubble bubble-3"></div>
                        <div className="battery-bubble bubble-4"></div>
                        <div className="battery-bubble bubble-5"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ width: '100%', borderTop: '1px solid var(--card-border)', paddingTop: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status Classification</span>
                      <h4 style={{ fontSize: '1.2rem', fontWeight: '800', marginTop: '0.1rem', color: prediction ? prediction.health_color : 'white' }}>
                        {prediction ? `${prediction.health_indicator} ${prediction.health_status}` : '--'}
                      </h4>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Prediction Confidence</span>
                      <h4 style={{ fontSize: '1.2rem', fontWeight: '800', marginTop: '0.1rem', color: 'white' }}>
                        {prediction ? `${prediction.confidence}%` : '--%'}
                      </h4>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Live interactive plot and history */}
            <div className="dashboard-grid">
              {/* Left Column: Recharts Scatter Plot */}
              <div className="glass-card" style={{ height: '420px', display: 'flex', flexSpace: 'column' }}>
                <div className="card-header" style={{ marginBottom: '1rem' }}>
                  <div className="icon-wrap"><BarChart2 size={18} /></div>
                  <div>
                    <h3>Interactive Linear Regression Graph</h3>
                    <p>Hover to check screen hours vs battery percentage. Gold star indicates current prediction point.</p>
                  </div>
                </div>

                <div style={{ flexGrow: 1, width: '100%', height: '280px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart margin={{ top: 10, right: 5, bottom: 5, left: -25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis type="number" dataKey="x" name="Screen Time" unit="h" domain={[0, 11]} stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                      <YAxis type="number" dataKey="y" name="Battery" unit="%" domain={[0, 100]} stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '0.8rem' }} />
                      
                      <Scatter name="Actual Records" data={scatterData} fill="#3b82f6" opacity={0.5} />
                      <Line name="Regression Fit" data={regressionData} type="monotone" dataKey="y" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={false} />
                      
                      {prediction && (
                        <ReferenceDot 
                          x={prediction.screen_time} 
                          y={prediction.predicted_battery_percent_clamped} 
                          r={7} 
                          fill="#f59e0b" 
                          stroke="#ffffff" 
                          strokeWidth={2.5} 
                          isFront={true} 
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right Column: Saved History Card */}
              <div className="glass-card" style={{ height: '420px', display: 'flex', flexDirection: 'column', justifySpace: 'space-between' }}>
                <div>
                  <div className="card-header" style={{ marginBottom: '1rem' }}>
                    <div className="icon-wrap"><Clock size={18} /></div>
                    <div style={{ display: 'flex', justifySpace: 'space-between', alignItems: 'center', width: '100%' }}>
                      <div>
                        <h3>Prediction Log</h3>
                        <p>Locally cached records.</p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn-secondary" style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }} onClick={exportToCSV}>
                          <Download size={12} style={{ marginRight: '3px', display: 'inline' }} /> CSV
                        </button>
                        <button className="btn-secondary" style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }} onClick={downloadPDFReport}>
                          <FileText size={12} style={{ marginRight: '3px', display: 'inline' }} /> Report
                        </button>
                        <button className="btn-secondary" style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }} onClick={clearLocalHistory}>
                          <Trash2 size={12} style={{ marginRight: '3px', display: 'inline' }} /> Clear
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="history-list-container" style={{ maxHeight: '270px', overflowY: 'auto' }}>
                    {history.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', color: 'var(--text-muted)' }}>
                        <Clock size={36} opacity={0.3} style={{ marginBottom: '0.5rem' }} />
                        <span>No predictions registered.</span>
                      </div>
                    ) : (
                      <ul className="history-panel-ul">
                        {history.map(item => (
                          <li 
                            key={item.id} 
                            className="history-panel-li"
                            onClick={() => {
                              setScreenTime(item.screen_time_hours.toString());
                              executePrediction(item.screen_time_hours);
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.timestamp}</span>
                              <span>Screen: <strong>{item.screen_time_hours}h</strong></span>
                            </div>
                            <span style={{ 
                              fontWeight: '700', 
                              color: item.health_status === 'Excellent' ? 'var(--color-success)' :
                                     item.health_status === 'Good' ? 'var(--color-warning)' : 'var(--color-danger)'
                            }}>
                              {item.predicted_battery_percent_clamped}%
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Row 4: AI Recommendations Cards */}
            <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="glass-card" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.04) 0%, rgba(16, 185, 129, 0.04) 100%)' }}>
                <div className="card-header">
                  <div className="icon-wrap"><Sparkles size={18} /></div>
                  <div>
                    <h3>AI Diagnostic & Power Recommendations</h3>
                    <p>Calculated heuristics based on active prediction window.</p>
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem', marginTop: '1rem' }}>
                  <div>
                    <h4 style={{ color: 'var(--color-primary)', fontSize: '0.95rem', marginBottom: '0.5rem' }}>Analysis:</h4>
                    <p style={{ fontSize: '0.92rem', lineHeight: '1.6' }}>
                      {prediction ? prediction.recommendation : "Load prediction parameters to receive automated recommendation analysis."}
                    </p>
                  </div>
                  <div>
                    <h4 style={{ color: 'var(--color-success)', fontSize: '0.95rem', marginBottom: '0.5rem' }}>Actionable Tips:</h4>
                    <ul style={{ listStyle: 'none', paddingLeft: 0, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {prediction ? prediction.tips.map((tip, idx) => (
                        <li key={idx} style={{ fontSize: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start', color: 'var(--text-main)' }}>
                          <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>✓</span>
                          <span>{tip}</span>
                        </li>
                      )) : (
                        <li style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Enter screen time coordinates to parse tips.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: MODEL ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="plot-header">
              <div>
                <h3>Model Regression Fit (Dataset Bounds)</h3>
                <p>Complete scatter mapping containing linear model regression fit lines.</p>
              </div>
            </div>
            
            <div style={{ width: '100%', height: '400px', background: '#111827', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '1rem 0' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart margin={{ top: 20, right: 20, bottom: 20, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" dataKey="x" name="Screen Time" unit="h" domain={[0, 11]} stroke="var(--text-muted)" />
                  <YAxis type="number" dataKey="y" name="Battery" unit="%" domain={[0, 100]} stroke="var(--text-muted)" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Scatter name="Actual Records" data={scatterData} fill="#3b82f6" opacity={0.6} />
                  <Line name="Regression Fit Line" data={regressionData} type="monotone" dataKey="y" stroke="#ef4444" strokeWidth={2.5} dot={false} activeDot={false} />
                  {prediction && (
                    <ReferenceDot 
                      x={prediction.screen_time} 
                      y={prediction.predicted_battery_percent_clamped} 
                      r={8} 
                      fill="#f59e0b" 
                      stroke="#ffffff" 
                      strokeWidth={2} 
                      isFront={true} 
                      label={{ value: `${prediction.predicted_battery_percent_clamped}%`, fill: 'white', fontSize: 10, offset: 12, position: 'top' }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="plot-info" style={{ marginTop: '1rem' }}>
              <div className="info-alert" style={{ background: 'rgba(59, 130, 246, 0.05)', borderColor: 'rgba(59, 130, 246, 0.1)' }}>
                <Clock size={20} style={{ color: 'var(--color-primary)' }} />
                <p style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                  <strong>Statistical Inference:</strong> The linear equation derived is: <strong>{modelStats?.equation}</strong>. The \(R^2\) coefficient is <strong>{modelStats?.r2_score}</strong>, representing a very high correlation where <strong>{(parseFloat(modelStats?.r2_score || 0) * 100).toFixed(1)}%</strong> of variance in battery depletion is explained directly by screen time duration.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AI ASSISTANT CHATBOT */}
        {activeTab === 'chatbot' && (
          <div className="glass-card chatbot-box">
            <div className="card-header" style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div className="icon-wrap"><MessageSquare size={18} /></div>
              <div>
                <h3>VoltPredict Conversational Companion</h3>
                <p>Discuss battery behavior, regression statistics, or get charging recommendations.</p>
              </div>
            </div>

            {/* Chat History Panel */}
            <div className="chat-history">
              {chatMessages.map((msg, index) => (
                <div key={index} className={`chat-msg ${msg.sender === 'user' ? 'user' : 'bot'}`}>
                  {msg.text.split('\n').map((line, i) => (
                    <p key={i} style={{ marginBottom: i < msg.text.split('\n').length - 1 ? '0.4rem' : '0' }}>{line}</p>
                  ))}
                </div>
              ))}
              {botTyping && (
                <div className="chat-msg bot" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span className="pulse-dot" style={{ width: '6px', height: '6px', backgroundColor: 'var(--text-muted)' }}></span>
                  <span className="pulse-dot" style={{ width: '6px', height: '6px', backgroundColor: 'var(--text-muted)', animationDelay: '0.2s' }}></span>
                  <span className="pulse-dot" style={{ width: '6px', height: '6px', backgroundColor: 'var(--text-muted)', animationDelay: '0.4s' }}></span>
                </div>
              )}
              <div ref={chatEndRef}></div>
            </div>

            {/* Chat Form Input */}
            <form onSubmit={handleChatSubmit} className="chat-input-row">
              <input 
                type="text" 
                placeholder="Ask about saving battery, regression formulas, or device health..."
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)} 
                required 
              />
              <button type="submit" className="chat-send-btn">
                <Send size={16} />
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: DATA EXPLORER */}
        {activeTab === 'explorer' && (
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-header" style={{ marginBottom: '1.5rem' }}>
              <div className="icon-wrap"><Database size={18} /></div>
              <div>
                <h3>Testing Dataset Records</h3>
                <p>Complete logs used to fit the battery prediction linear equation.</p>
              </div>
            </div>

            {/* Search filter input */}
            <div className="form-group" style={{ maxWidth: '350px' }}>
              <label>Filter Records by Screen Hours</label>
              <input 
                type="text" 
                className="form-input" 
                style={{ padding: '0.65rem 1rem' }} 
                placeholder="Type screen time..." 
                onChange={(e) => {
                  const val = e.target.value.trim().toLowerCase();
                  if (!val) {
                    fetchChartData();
                  } else {
                    setScatterData(prev => prev.filter(row => row.x.toString().includes(val)));
                  }
                }}
              />
            </div>

            {/* Table Container */}
            <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--card-border)', borderRadius: '12px' }}>
              <table className="data-table-explorer">
                <thead>
                  <tr>
                    <th>Record Index</th>
                    <th>Screen Time Hours (hrs)</th>
                    <th>Battery Remaining Percent (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {scatterData.map((row, idx) => (
                    <tr key={idx}>
                      <td>#{idx + 1}</td>
                      <td><strong>{row.x}</strong> hrs</td>
                      <td>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: row.y >= 60 ? 'var(--color-success)' : row.y >= 25 ? 'var(--color-warning)' : 'var(--color-danger)', marginRight: '6px' }}></span>
                        {row.y}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* User Profile Footer widget */}
        <footer style={{ marginTop: 'auto', paddingTop: '2.5rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--card-border)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <User size={12} /> User: <strong>Shravni</strong>
            </span>
            <span>Device: <strong>VoltX AI Pro</strong></span>
            <span>OS: <strong>VoltOS v3.2</strong></span>
          </div>
          <div>
            <span>VoltPredict AI Predictive Engine • 2026</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
