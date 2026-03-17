"use client";
import { useState, useRef } from "react";
import { Upload, Link as LinkIcon, Image as ImageIcon, Sparkles, Loader2, RefreshCw } from "lucide-react";
import CheckoutHub from "./CheckoutHub";
import ProcessingLoader from "./ProcessingLoader";

interface PriceItem {
  platform: string;
  price: number;
  currency: string;
  url: string;
  isBest?: boolean;
}

export default function MagicMirror() {
  const [basePhoto, setBasePhoto] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<"image" | "link">("link");
  const [targetInput, setTargetInput] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [priceData, setPriceData] = useState<PriceItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetFileInputRef = useRef<HTMLInputElement>(null);

  const handleBasePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBasePhoto(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleTargetPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTargetInput(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleGenerate = async () => {
    if (!basePhoto || !targetInput) return;
    
    setIsProcessing(true);
    setError(null);
    setResultImage(null);
    setResultMessage(null);
    setIsFallback(false);
    setPriceData([]);

    try {
      // 1. Call Try-On API
      const tryOnResp = await fetch("/api/try-on", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basePhotoUrl: basePhoto,
          targetImageUrl: targetInput
        })
      });
      
      const tryOnData = await tryOnResp.json();
      if (!tryOnResp.ok) throw new Error(tryOnData.error || "Try-on failed");
      
      setResultImage(tryOnData.result);
      setResultMessage(tryOnData.message);
      setIsFallback(tryOnData.isFallback);

      // 2. Call Pricing API (if it's a link or we have metadata)
      const pricingResp = await fetch("/api/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: targetInput })
      });
      
      const pricingData = await pricingResp.json();
      if (pricingResp.ok && pricingData.results) {
        setPriceData(pricingData.results);
      }

    } catch (err: unknown) {
      console.error("Mirror Error:", err);
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isProcessing) {
    return <ProcessingLoader />;
  }

  if (resultImage) {
    return (
      <div className="flex flex-col gap-8 animate-in fade-in duration-500">
        <section className="bg-black rounded-[2.5rem] p-2 shadow-2xl overflow-hidden relative aspect-[3/4]">
           {/* eslint-disable-next-line @next/next/no-img-element */}
           <img src={resultImage} alt="Magic Mirror Result" className="w-full h-full object-cover rounded-[2.2rem]" />
            <div className="absolute top-6 left-6 bg-white/20 backdrop-blur-md px-4 py-2 rounded-full border border-white/30">
              <span className="text-white text-xs font-bold tracking-widest uppercase flex items-center gap-2">
                {isFallback ? (
                  <>Preview Only - AI Model Busy</>
                ) : (
                  <><Sparkles className="w-3 h-3" /> Magic Mirror Result</>
                )}
              </span>
            </div>
            {resultMessage && (
              <div className="absolute bottom-24 left-6 right-6 bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                <p className="text-white/80 text-[10px] leading-tight italic">
                  {resultMessage}
                </p>
              </div>
            )}
            <button 
              onClick={() => setResultImage(null)}
              className="absolute bottom-6 right-6 bg-white text-black p-4 rounded-full shadow-lg hover:scale-105 transition-transform"
            >
              <RefreshCw className="w-6 h-6" />
            </button>
        </section>

        {priceData.length > 0 && <CheckoutHub items={priceData} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl text-sm font-medium">
          {error}
        </div>
      )}

      {/* Base Photo Section */}
      <section className="bg-[#f5f5f7] rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden">
        <h2 className="text-xl font-bold text-black mb-4">Your Base Photo</h2>
        
        {!basePhoto ? (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="h-64 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center bg-white cursor-pointer hover:border-black transition-colors group"
          >
            <Upload className="w-10 h-10 text-gray-400 group-hover:text-black mb-4 transition-colors" />
            <p className="text-gray-500 font-medium">Upload a full-body photo</p>
            <p className="text-gray-400 text-sm mt-1">JPEG, PNG up to 5MB</p>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleBasePhotoUpload}
            />
          </div>
        ) : (
          <div className="relative h-64 rounded-2xl overflow-hidden group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={basePhoto} alt="Base" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button 
                onClick={() => setBasePhoto(null)}
                className="bg-white text-black px-4 py-2 rounded-xl font-semibold text-sm"
              >
                Change Photo
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Target Item Section */}
      <section className="bg-[#f5f5f7] rounded-3xl p-6 border border-gray-100 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-black">What to Try On?</h2>
        </div>

        <div className="flex gap-2 mb-4 bg-white p-1 rounded-2xl border border-gray-200">
          <button
            onClick={() => { setTargetType("link"); setTargetInput(null); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
              targetType === "link" ? "bg-black text-white shadow-md" : "text-gray-500 hover:text-black"
            }`}
          >
            <LinkIcon className="w-4 h-4" /> Link
          </button>
          <button
            onClick={() => { setTargetType("image"); setTargetInput(null); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
              targetType === "image" ? "bg-black text-white shadow-md" : "text-gray-500 hover:text-black"
            }`}
          >
            <ImageIcon className="w-4 h-4" /> Image
          </button>
        </div>

        {targetType === "link" ? (
          <div className="relative">
            <input
              type="url"
              placeholder="Paste product link (Amazon, Myntra...)"
              className="w-full bg-white border border-gray-200 rounded-2xl py-4 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
              onChange={(e) => setTargetInput(e.target.value)}
              value={targetInput || ""}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-gray-100 p-2 rounded-xl">
              <LinkIcon className="w-4 h-4 text-gray-500" />
            </div>
          </div>
        ) : (
          <div 
            onClick={() => targetFileInputRef.current?.click()}
            className="h-32 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center bg-white cursor-pointer hover:border-black transition-colors group"
          >
            <ImageIcon className="w-6 h-6 text-gray-400 group-hover:text-black mb-2 transition-colors" />
            <p className="text-gray-500 font-medium text-sm">Upload clothing image</p>
            <input 
              type="file" 
              ref={targetFileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleTargetPhotoUpload}
            />
          </div>
        )}

        {targetInput && targetType === "image" && (
          <div className="mt-4 flex items-center gap-4 bg-white p-3 rounded-2xl border border-gray-200">
             {/* eslint-disable-next-line @next/next/no-img-element */}
             <img src={targetInput} className="w-16 h-16 rounded-xl object-cover border border-gray-100" alt="target" />
             <p className="text-sm font-medium text-gray-600 truncate flex-1">Image ready to process</p>
             <button onClick={() => setTargetInput(null)} className="text-gray-400 hover:text-black text-sm pr-2">Clear</button>
          </div>
        )}
      </section>

      {/* Generate Button */}
      <button 
        disabled={!basePhoto || !targetInput || isProcessing}
        onClick={handleGenerate}
        className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-black/10 hover:bg-gray-800 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2 mt-4"
      >
        {isProcessing ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Sparkles className="w-5 h-5" />
        )}
        Generate Try-On
      </button>
    </div>
  );
}
