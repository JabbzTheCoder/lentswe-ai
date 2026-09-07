"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Square, Upload, Copy, Check, FileAudio } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [summarize, setSummarize] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  
  const [transcript, setTranscript] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 5 minutes max
  const MAX_RECORDING_TIME = 300; 
  const MAX_FILE_SIZE = 5.5 * 1024 * 1024;

  useEffect(() => {
    if (recordingTime >= MAX_RECORDING_TIME && isRecording) {
      stopRecording();
    }
  }, [recordingTime, isRecording]);

  const startRecording = async () => {
    try {
      setError(null);
      setTranscript(null);
      setSummary(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
      let selectedMimeType = "";
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        throw new Error("No supported audio MIME type found on this browser.");
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: selectedMimeType });
        if (audioBlob.size > MAX_FILE_SIZE) {
          setError("Audio file exceeds Netlify 5.5MB limit. Please record a shorter clip.");
          setAudioBlob(null);
          setAudioUrl(null);
        } else {
          setAudioBlob(audioBlob);
          setAudioUrl(URL.createObjectURL(audioBlob));
        }
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      
    } catch (err: any) {
      setError("Failed to access microphone. Please check permissions.");
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setTranscript(null);
    setSummary(null);

    if (file.size > MAX_FILE_SIZE) {
      setError("Audio file exceeds Netlify 5.5MB limit. Please upload a smaller clip.");
      event.target.value = '';
      return;
    }

    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!audioBlob) return;
    
    setIsLoading(true);
    setError(null);
    setTranscript(null);
    setSummary(null);

    const formData = new FormData();
    const extension = audioBlob.type.split('/')[1]?.split(';')[0] || 'webm';
    formData.append("file", audioBlob, `audio.${extension}`);
    formData.append("summarize", summarize.toString());

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to process audio.");
      }

      setTranscript(data.transcript);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: 'transcript' | 'summary') => {
    navigator.clipboard.writeText(text);
    if (type === 'transcript') {
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    } else {
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">LentsweAI</h1>
          <p className="mt-2 text-lg text-gray-600">
            Capture, transcribe, and summarize your voice notes instantly.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-8 border border-gray-100">
          
          {/* Input Controls */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-6">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={isLoading}
                className="flex items-center justify-center w-24 h-24 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg transition-all active:scale-95 disabled:opacity-50"
              >
                <Mic size={36} />
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex items-center justify-center w-24 h-24 rounded-full bg-gray-800 hover:bg-gray-900 text-white shadow-lg transition-all active:scale-95 animate-pulse"
              >
                <Square size={36} fill="currentColor" />
              </button>
            )}
            
            <div className="flex flex-col items-center justify-center">
              <span className={`text-3xl font-mono ${isRecording ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                {formatTime(recordingTime)}
              </span>
              {isRecording && (
                <span className="text-xs text-red-500 font-medium mt-1">Recording... (Max 5:00)</span>
              )}
            </div>

            <div className="hidden md:block h-16 w-px bg-gray-200"></div>

            <div className="flex flex-col items-center">
              <input
                type="file"
                accept=".m4a, .ogg, .mp3, .wav, .webm, audio/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
                disabled={isRecording || isLoading}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isRecording || isLoading}
                className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-gray-200 text-gray-700 rounded-xl hover:border-blue-500 hover:text-blue-600 transition-colors disabled:opacity-50 font-medium"
              >
                <Upload size={20} />
                Upload Audio
              </button>
              <span className="text-xs text-gray-400 mt-2">Max size: 5.5 MB</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 text-sm font-medium text-center">
              {error}
            </div>
          )}

          {/* Preview & Submit */}
          {audioUrl && !isRecording && (
            <div className="space-y-6 pt-4 border-t border-gray-100">
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-gray-700 font-medium">
                  <FileAudio size={20} className="text-blue-500" />
                  <span>Audio Ready</span>
                </div>
                <audio src={audioUrl} controls className="w-full max-w-md rounded-lg" />
              </div>

              <div className="flex items-center justify-center gap-3">
                <input
                  type="checkbox"
                  id="summarize"
                  checked={summarize}
                  onChange={(e) => setSummarize(e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <label htmlFor="summarize" className="text-gray-700 font-medium cursor-pointer select-none">
                  Summarize & extract key takeaways
                </label>
              </div>

              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-70 flex justify-center items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing AI Request...
                  </>
                ) : (
                  "Transcribe & Summarize"
                )}
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        {(summary || transcript) && (
          <div className="space-y-6">
            {summary && (
              <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-indigo-500">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Key Takeaways</h2>
                  <button
                    onClick={() => copyToClipboard(summary, 'summary')}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Copy Summary"
                  >
                    {copiedSummary ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                  </button>
                </div>
                <div className="prose prose-indigo max-w-none text-gray-700">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                </div>
              </div>
            )}

            {transcript && (
              <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-blue-500">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Raw Transcript</h2>
                  <button
                    onClick={() => copyToClipboard(transcript, 'transcript')}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Copy Transcript"
                  >
                    {copiedTranscript ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                  </button>
                </div>
                <div className="prose max-w-none text-gray-600 whitespace-pre-wrap font-serif leading-relaxed">
                  {transcript}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
