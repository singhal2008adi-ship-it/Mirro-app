"use client";
import { useState, useRef } from "react";
import { Upload, Link as LinkIcon, Image as ImageIcon, Sparkles } from "lucide-react";

export default function MagicMirror() {
  const [basePhoto, setBasePhoto] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<"image" | "link">("link");
  const [targetInput, setTargetInput] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetFileInputRef = useRef<HTMLInputElement>(null);

  const handleBasePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBasePhoto(URL.createObjectURL(file));
      // TODO: Upload to Firebase Storage
    }
  };

  const handleTargetPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTargetInput(URL.createObjectURL(file));
      // TODO: Handle target image upload
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
            onClick={() => setTargetType("link")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
              targetType === "link" ? "bg-black text-white shadow-md" : "text-gray-500 hover:text-black"
            }`}
          >
            <LinkIcon className="w-4 h-4" /> Link
          </button>
          <button
            onClick={() => setTargetType("image")}
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
        disabled={!basePhoto || !targetInput}
        className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-black/10 hover:bg-gray-800 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2 mt-4"
      >
        <Sparkles className="w-5 h-5" />
        Generate Try-On
      </button>
    </div>
  );
}
