import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Settings2 } from 'lucide-react';

interface ActionResponse {
  action: string;
  app?: string;
  query?: string;
  text_to_type?: string;
  response_text: string;
  audioBase64?: string;
}

type AppStatus = 'idle' | 'listening' | 'processing' | 'speaking';

const VOICE_OPTIONS = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

export default function App() {
  const [status, setStatus] = useState<AppStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [displayText, setDisplayText] = useState('SYSTEM ONLINE');
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [showSettings, setShowSettings] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    // Initialize Speech Recognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'hi-IN'; // Set language to Hindi
        
        recognitionRef.current.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          
          const currentText = finalTranscript || interimTranscript;
          setTranscript(currentText);
          setDisplayText(currentText);
          
          if (finalTranscript) {
            handleUserCommand(finalTranscript);
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setStatus('idle');
          if (event.error === 'not-allowed') {
            setDisplayText('MICROPHONE ACCESS DENIED');
          } else {
            setDisplayText(`ERROR: ${event.error.toUpperCase()}`);
          }
        };

        recognitionRef.current.onend = () => {
          if (status === 'listening') {
             setStatus('idle');
          }
        };
      } else {
        setDisplayText('SPEECH RECOGNITION NOT SUPPORTED');
      }
    }
  }, [status]);

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Ignore errors if already stopped
      }
      sourceNodeRef.current = null;
    }
  };

  const playHighQualityAudio = async (base64Data: string, text: string) => {
    stopAudio();
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      // Resume context if suspended (browser policy)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
      }
      
      const int16Array = new Int16Array(bytes.buffer);
      const audioBuffer = audioContextRef.current.createBuffer(1, int16Array.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      
      for (let i = 0; i < int16Array.length; i++) {
          channelData[i] = int16Array[i] / 32768.0;
      }

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      source.onended = () => {
        setStatus('idle');
        setDisplayText('STANDBY');
      };

      sourceNodeRef.current = source;
      setStatus('speaking');
      setDisplayText(text);
      source.start();
    } catch (e) {
      console.error("Audio playback error", e);
      setStatus('idle');
      setDisplayText('AUDIO PLAYBACK ERROR');
    }
  };

  const handleUserCommand = async (command: string) => {
    setStatus('processing');
    setDisplayText('PROCESSING...');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: command, voiceName: selectedVoice }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data: ActionResponse = await response.json();
      
      if (data.audioBase64) {
        playHighQualityAudio(data.audioBase64, data.response_text);
      } else {
        // Fallback if TTS generation failed
        setDisplayText(data.response_text);
        setStatus('idle');
      }

    } catch (error) {
      console.error('Error processing command:', error);
      setStatus('idle');
      setDisplayText('CONNECTION ERROR');
    }
  };

  const toggleListening = () => {
    if (status === 'listening') {
      try {
        recognitionRef.current?.stop();
      } catch (e) {
        console.error("Error stopping recognition:", e);
      }
      setStatus('idle');
      setDisplayText('STANDBY');
    } else {
      if (!recognitionRef.current) {
        setDisplayText('SPEECH RECOGNITION NOT SUPPORTED');
        return;
      }
      setTranscript('');
      setDisplayText('LISTENING...');
      try {
        stopAudio();
        recognitionRef.current.start();
        setStatus('listening');
      } catch (error: any) {
        console.error("Error starting recognition:", error);
        setStatus('idle');
        if (error.name === 'NotAllowedError') {
          setDisplayText('MICROPHONE ACCESS DENIED');
        } else {
          setDisplayText('FAILED TO START LISTENING');
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#050510] text-blue-400 font-sans overflow-hidden relative flex flex-col items-center justify-between py-12">
      {/* Background Particles/Stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-blue-500 rounded-full"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.5 + 0.1,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.1, 0.8, 0.1],
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Voice Settings Toggle */}
      <div className="absolute top-6 right-6 z-20">
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="p-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-400/50 transition-all backdrop-blur-md"
        >
          <Settings2 className="w-5 h-5 text-blue-400" />
        </button>
        
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="absolute top-14 right-0 bg-black/80 border border-blue-500/30 backdrop-blur-xl rounded-xl p-4 w-48 shadow-[0_0_30px_rgba(0,100,255,0.2)]"
            >
              <h3 className="text-xs font-bold tracking-widest text-blue-300 mb-3 uppercase">Voice Module</h3>
              <div className="space-y-2">
                {VOICE_OPTIONS.map(voice => (
                  <button
                    key={voice}
                    onClick={() => { setSelectedVoice(voice); setShowSettings(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedVoice === voice 
                        ? 'bg-blue-500/20 text-blue-200 border border-blue-500/50' 
                        : 'text-blue-400/70 hover:bg-white/5 hover:text-blue-300'
                    }`}
                  >
                    {voice}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Top Title */}
      <div className="z-10 mt-8">
        <h1 className="text-7xl font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-b from-white via-blue-200 to-blue-600 drop-shadow-[0_0_20px_rgba(0,100,255,0.8)]" style={{ fontFamily: "'Arial Black', sans-serif" }}>
          MAX
        </h1>
      </div>

      {/* Central Orb HUD */}
      <div className="relative flex items-center justify-center w-[400px] h-[400px] my-auto z-10">
        
        {/* Outer Orbital Rings */}
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute w-[120%] h-[120%] rounded-full border border-blue-500/20 border-t-blue-400/60 border-b-purple-500/40"
          style={{ transformStyle: 'preserve-3d', transform: 'rotateX(60deg)' }}
        />
        <motion.div 
          animate={{ rotate: -360 }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute w-[140%] h-[140%] rounded-full border border-purple-500/20 border-l-blue-400/50"
          style={{ transformStyle: 'preserve-3d', transform: 'rotateX(70deg) rotateY(20deg)' }}
        />

        {/* Core Sphere */}
        <motion.div 
          animate={{
            scale: status === 'listening' ? [1, 1.05, 1] : status === 'processing' ? [1, 1.1, 1] : status === 'speaking' ? [1, 1.02, 1] : 1,
            filter: status === 'listening' ? 'hue-rotate(30deg)' : status === 'processing' ? 'hue-rotate(-30deg)' : 'hue-rotate(0deg)'
          }}
          transition={{ 
            duration: status === 'processing' ? 1 : 2, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
          className="relative w-full h-full rounded-full flex items-center justify-center"
        >
          {/* Base Glow */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-900/80 via-blue-500/40 to-purple-500/40 blur-xl mix-blend-screen" />
          
          {/* Intense Center */}
          <div className="absolute inset-1/4 rounded-full bg-white shadow-[0_0_100px_rgba(255,255,255,1),0_0_150px_rgba(100,200,255,0.8)] blur-sm" />
          
          {/* Energy Lines (Simulated with multiple rotated borders) */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              animate={{ rotate: 360 * (i % 2 === 0 ? 1 : -1) }}
              transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "linear" }}
              className="absolute inset-2 rounded-full border border-blue-300/30 mix-blend-screen"
              style={{ borderRadius: `${40 + Math.random() * 20}% ${40 + Math.random() * 20}% ${40 + Math.random() * 20}% ${40 + Math.random() * 20}%` }}
            />
          ))}
          
          {/* Status specific effects */}
          {status === 'speaking' && (
            <motion.div 
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="absolute inset-0 rounded-full border-4 border-blue-400/50 blur-md"
            />
          )}
        </motion.div>
      </div>

      {/* Bottom Section: Text & Mic */}
      <div className="z-10 flex flex-col items-center gap-8 w-full max-w-2xl px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={displayText}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center min-h-[60px] flex items-center justify-center"
          >
            <p className="text-xl md:text-2xl font-medium tracking-wide text-blue-100 drop-shadow-[0_0_10px_rgba(100,200,255,0.5)]">
              {displayText}
            </p>
          </motion.div>
        </AnimatePresence>

        <button
          onClick={toggleListening}
          className={`relative group flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 ${
            status === 'listening' 
              ? 'bg-blue-500/20 border-2 border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.5)]' 
              : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-400/50'
          } backdrop-blur-md`}
        >
          {status === 'listening' ? (
            <div className="relative flex items-center justify-center">
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute w-full h-full bg-blue-400/30 rounded-full"
              />
              <MicOff className="w-8 h-8 text-blue-300 relative z-10" />
            </div>
          ) : (
            <Mic className="w-8 h-8 text-blue-400 group-hover:text-blue-300 transition-colors" />
          )}
        </button>
      </div>
    </div>
  );
}
