"use client";

import { useState } from "react";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setResponse("");

    try {
      const res = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();
      setResponse(data.response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold mb-6">SOVARA AI — Local Chat Test</h1>

      <div className="w-full max-w-xl flex flex-col gap-4">
        <textarea
          className="w-full p-3 rounded bg-gray-900 border border-gray-700 text-white"
          rows={4}
          placeholder="Type your prompt..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded"
        >
          {loading ? "Thinking..." : "Send"}
        </button>

        {error && (
          <div className="p-3 rounded bg-red-900 border border-red-700 text-red-200">
            Error: {error}
          </div>
        )}

        {response && (
          <div className="p-3 rounded bg-gray-900 border border-gray-700">
            <p className="text-sm text-gray-400 mb-1">Response:</p>
            <p>{response}</p>
          </div>
        )}
      </div>
    </main>
  );
}