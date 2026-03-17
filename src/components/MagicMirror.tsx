"use client";
import { useState, useRef } from "react";
import { Upload, Link as LinkIcon, Sparkles, Loader2, RefreshCw, CheckCircle } from "lucide-react";
import CheckoutHub from "./CheckoutHub";
import ProcessingLoader from "./ProcessingLoader";

interface PriceItem {
  platform: string;
  price: number;
  currency: string;
  url: string;
  isBest?: boolean;
  title?: string;
}

// Converts a File object to a base64 data URL (so server can read it — blob:// URLs don't work server-side)
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function MagicMirror() {
  // Step 1: User's own photo
  const [basePhoto, setBasePhoto] = useState<string | null>(null);   // blob URL for preview
  const [baseFile, setBaseFile] = useState<File | null>(null);        // actual file for base64 conversion

  // Step 2: Garment image from upload
  const [garmentPhoto, setGarmentPhoto] = useState<string | null>(null);
  const [garmentFile, setGarmentFile] = useState<File | null>(null);

  // Step 3: Product link for pricing (optional)
  const [productLink, setProductLink] = useState<string>("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [engine, setEngine] = useState<string | null>(null);
  const [priceData, setPriceData] = useState<PriceItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const baseInputRef = useRef<HTMLInputElement>(null);
  const garmentInputRef = useRef<HTMLInputElement>(null);

  const handleBaseUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBaseFile(file);
      setBasePhoto(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleGarmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setGarmentFile(file);
      setGarmentPhoto(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleGenerate = async () => {
    if (!baseFile || !garmentFile) return;

    setIsProcessing(true);
    setError(null);
    setResultImage(null);
    setResultMessage(null);
    setEngine(null);
    setIsFallback(false);
    setPriceData([]);

    try {
      // Convert both images to base64 — this is the critical fix.
      // blob:// URLs only work in the browser and cannot be fetched by the server.
      const [basePhotoData, garmentImageData] = await Promise.all([
        fileToBase64(baseFile),
        fileToBase64(garmentFile)
      ]);

      // 1. Virtual Try-On
      const tryOnResp = await fetch("/api/try-on", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basePhotoData, garmentImageData })
      });

      const tryOnData = await tryOnResp.json();
      if (!tryOnResp.ok) throw new Error(tryOnData.error || "Try-on failed");

      setResultImage(tryOnData.result);
      setResultMessage(tryOnData.message);
      setIsFallback(tryOnData.isFallback ?? false);
      setEngine(tryOnData.engine);

      // 2. Pricing — use product link if provided, else garment image
      const pricingPayload = productLink.startsWith("http")
        ? { query: productLink }
        : { imageBase64: garmentImageData };

      const pricingResp = await fetch("/api/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pricingPayload)
      });

      const pricingData = await pricingResp.json();
      if (pricingResp.ok && pricingData.results) {
        setPriceData(pricingData.results);
      }
    } catch (err: unknown) {
      console.error("Mirror Error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setResultImage(null);
    setResultMessage(null);
    setEngine(null);
    setIsFallback(false);
    setPriceData([]);
  };

  if (isProcessing) return <ProcessingLoader />;

  if (resultImage) {
    return (
      <div className="flex flex-col gap-8 animate-in fade-in duration-500">
        <section className="bg-black rounded-[2.5rem] p-2 shadow-2xl overflow-hidden relative aspect-[3/4]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultImage} alt="Try-On Result" className="w-full h-full object-cover rounded-[2.2rem]" />

          <div className="absolute top-6 left-6 bg-white/20 backdrop-blur-md px-4 py-2 rounded-full border border-white/30">
            <span className="text-white text-xs font-bold tracking-widest uppercase flex items-center gap-2">
              {isFallback ? (
                <span>⚡ {engine || "Preview Mode"}</span>
              ) : (
                <><Sparkles className="w-3 h-3" /> {engine || "AI Try-On"}</>
              )}
            </span>
          </div>

          {resultMessage && (
            <div className="absolute bottom-24 left-6 right-6 bg-black/70 backdrop-blur-md p-3 rounded-2xl border border-white/10">
              <p className="text-white/90 text-[11px] leading-relaxed">{resultMessage}</p>
            </div>
          )}

          <button
            onClick={handleReset}
            className="absolute bottom-6 right-6 bg-white text-black p-4 rounded-full shadow-lg hover:scale-105 transition-transform"
          >
            <RefreshCw className="w-6 h-6" />
          </button>
        </section>

        {priceData.length > 0 && <CheckoutHub items={priceData} />}
      </div>
    );
  }

  const canGenerate = !!baseFile && !!garmentFile;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Step 1: Base Photo */}
      <section className="bg-[#f5f5f7] rounded-3xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${baseFile ? "bg-black text-white" : "bg-gray-200 text-gray-500"}`}>
            {baseFile ? <CheckCircle className="w-4 h-4" /> : "1"}
          </div>
          <h2 className="text-xl font-bold text-black">Your Photo</h2>
        </div>

        {!basePhoto ? (
          <div
            onClick={() => baseInputRef.current?.click()}
            className="h-56 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center bg-white cursor-pointer hover:border-black transition-colors group"
          >
            <Upload className="w-10 h-10 text-gray-400 group-hover:text-black mb-3 transition-colors" />
            <p className="text-gray-600 font-semibold">Upload a full-body photo</p>
            <p className="text-gray-400 text-sm mt-1">JPEG or PNG</p>
            <input type="file" ref={baseInputRef} className="hidden" accept="image/*" onChange={handleBaseUpload} />
          </div>
        ) : (
          <div className="relative h-56 rounded-2xl overflow-hidden group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={basePhoto} alt="Your photo" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button onClick={() => { setBasePhoto(null); setBaseFile(null); }} className="bg-white text-black px-4 py-2 rounded-xl font-semibold text-sm">
                Change Photo
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Step 2: Garment Image */}
      <section className="bg-[#f5f5f7] rounded-3xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${garmentFile ? "bg-black text-white" : "bg-gray-200 text-gray-500"}`}>
            {garmentFile ? <CheckCircle className="w-4 h-4" /> : "2"}
          </div>
          <h2 className="text-xl font-bold text-black">Garment Image</h2>
        </div>
        <p className="text-gray-500 text-sm mb-4">Upload a photo of the clothing item you want to try on</p>

        {!garmentPhoto ? (
          <div
            onClick={() => garmentInputRef.current?.click()}
            className="h-36 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center bg-white cursor-pointer hover:border-black transition-colors group"
          >
            <Upload className="w-8 h-8 text-gray-400 group-hover:text-black mb-2 transition-colors" />
            <p className="text-gray-500 font-medium text-sm">Upload clothing photo</p>
            <input type="file" ref={garmentInputRef} className="hidden" accept="image/*" onChange={handleGarmentUpload} />
          </div>
        ) : (
          <div className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-gray-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={garmentPhoto} className="w-20 h-20 rounded-xl object-cover border border-gray-100" alt="Garment" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-black">Garment ready</p>
              <p className="text-xs text-gray-400 mt-0.5">Image loaded for try-on</p>
            </div>
            <button onClick={() => { setGarmentPhoto(null); setGarmentFile(null); }} className="text-gray-400 hover:text-black text-sm">Clear</button>
          </div>
        )}
      </section>

      {/* Step 3: Product Link (optional, for pricing only) */}
      <section className="bg-[#f5f5f7] rounded-3xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-gray-200 text-gray-500">3</div>
          <h2 className="text-xl font-bold text-black">Product Link <span className="text-gray-400 font-normal text-sm">(optional)</span></h2>
        </div>
        <p className="text-gray-500 text-sm mb-4">Paste a Myntra, Amazon, or Flipkart link to get real price comparisons</p>

        <div className="relative">
          <input
            type="url"
            placeholder="https://myntra.com/shirts/..."
            value={productLink}
            onChange={(e) => setProductLink(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-2xl py-4 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all text-sm"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-gray-100 p-2 rounded-xl">
            <LinkIcon className="w-4 h-4 text-gray-500" />
          </div>
        </div>
      </section>

      {/* Generate Button */}
      <button
        disabled={!canGenerate || isProcessing}
        onClick={handleGenerate}
        className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-black/10 hover:bg-gray-800 disabled:opacity-40 disabled:shadow-none transition-all flex items-center justify-center gap-2 mt-2"
      >
        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
        {canGenerate ? "Generate Try-On" : "Upload both photos to continue"}
      </button>
    </div>
  );
}
