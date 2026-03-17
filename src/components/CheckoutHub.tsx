"use client";
import { useState } from "react";
import { Sparkles, ShoppingBag, ExternalLink, TrendingDown } from "lucide-react";

interface PriceItem {
  platform: string;
  price: number;
  currency: string;
  url: string;
  isBest?: boolean;
  isFromSearch?: boolean;
}

interface CheckoutHubProps {
  items: PriceItem[];
  isLoading?: boolean;
  isFromGoogleShopping?: boolean;
}

export default function CheckoutHub({ items, isLoading = false, isFromGoogleShopping = false }: CheckoutHubProps) {
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded-lg w-1/3 mb-6"></div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between items-center p-4 bg-[#f5f5f7] rounded-2xl">
            <div className="flex flex-col gap-2">
              <div className="h-4 bg-gray-200 rounded w-20"></div>
              <div className="h-4 bg-gray-200 rounded w-16"></div>
            </div>
            <div className="h-10 w-24 bg-gray-200 rounded-xl"></div>
          </div>
        ))}
      </div>
    );
  }

  const sortedItems = [...items].sort((a, b) => a.price - b.price);
  const displayed = showAll ? sortedItems : sortedItems.slice(0, 3);

  return (
    <div className="bg-[#f5f5f7] rounded-3xl p-6 border border-gray-100 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-black" />
          <h2 className="text-xl font-bold text-black">Shop This Look</h2>
        </div>
        {isFromGoogleShopping && (
          <span className="flex items-center gap-1 bg-green-100 text-green-800 text-[10px] font-bold px-2 py-1 rounded-full">
            <TrendingDown className="w-3 h-3" /> LIVE PRICES
          </span>
        )}
      </div>

      <div className="space-y-3">
        {displayed.map((item, index) => {
          const isBest = item.isBest || index === 0;
          return (
            <div
              key={index}
              className={`flex items-center justify-between p-4 rounded-2xl transition-all ${
                isBest
                  ? "bg-white border-2 border-black shadow-md"
                  : "bg-white border border-gray-200"
              }`}
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-black">{item.platform}</span>
                  {isBest && (
                    <span className="bg-black text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> BEST
                    </span>
                  )}
                  {item.isFromSearch && (
                    <span className="bg-blue-50 text-blue-700 text-[9px] font-semibold px-1.5 py-0.5 rounded-full">Live</span>
                  )}
                </div>
                <p className="text-lg font-bold">
                  {item.currency}{item.price.toLocaleString()}
                </p>
              </div>

              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                  isBest
                    ? "bg-black text-white hover:bg-gray-800"
                    : "bg-gray-100 text-black hover:bg-gray-200"
                }`}
              >
                Buy <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          );
        })}
      </div>

      {sortedItems.length > 3 && !showAll && (
        <button
          className="w-full mt-4 text-center text-sm font-medium text-gray-500 hover:text-black transition-colors py-2"
          onClick={() => setShowAll(true)}
        >
          Show {sortedItems.length - 3} more options ↓
        </button>
      )}
    </div>
  );
}
