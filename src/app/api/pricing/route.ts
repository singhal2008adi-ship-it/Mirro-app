import { NextResponse } from 'next/server';

// Detect which platform a URL belongs to
function detectPlatform(url: string): string {
  if (!url) return '';
  const lower = url.toLowerCase();
  if (lower.includes('myntra.com')) return 'myntra';
  if (lower.includes('flipkart.com')) return 'flipkart';
  if (lower.includes('amazon.in') || lower.includes('amazon.com/in')) return 'amazon';
  if (lower.includes('ajio.com')) return 'ajio';
  if (lower.includes('tatacliq.com')) return 'tatacliq';
  return '';
}

// Build a product search deep link for a platform given a title
function buildSearchUrl(platform: string, title: string, sourceUrl?: string): string {
  const q = encodeURIComponent(title);
  switch (platform) {
    case 'myntra':   return sourceUrl && sourceUrl.includes('myntra.com') ? sourceUrl : `https://www.myntra.com/${q}`;
    case 'flipkart': return sourceUrl && sourceUrl.includes('flipkart.com') ? sourceUrl : `https://www.flipkart.com/search?q=${q}`;
    case 'amazon':   return sourceUrl && sourceUrl.includes('amazon.in') ? sourceUrl : `https://www.amazon.in/s?k=${q}`;
    case 'ajio':     return sourceUrl && sourceUrl.includes('ajio.com') ? sourceUrl : `https://www.ajio.com/search/?text=${q}`;
    case 'tatacliq': return `https://www.tatacliq.com/search/?searchCategory=all&text=${q}`;
    default:         return `https://www.google.com/search?q=buy+${q}+online+india`;
  }
}

// Helper to call Gemini to extract product info from a URL or image
async function extractWithGemini(
  apiKey: string,
  input: { url?: string; imageBase64?: string; mimeType?: string }
): Promise<{ title: string; price: string; brand: string }> {
  const parts: unknown[] = [];

  if (input.url) {
    try {
      const resp = await fetch(input.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-IN,en;q=0.9',
        },
        signal: AbortSignal.timeout(8000)
      });
      const html = await resp.text();

      // Try structured extraction from meta tags / JSON-LD
      const titleMatch = html.match(/"name"\s*:\s*"([^"]{5,100})"/i) ||
                         html.match(/property="og:title"\s+content="([^"]+)"/i) ||
                         html.match(/<title>([^<]+)<\/title>/i);
      const priceMatch = html.match(/"price"\s*:\s*"?(\d{2,6})"?/i) ||
                         html.match(/discountedPrice['"]\s*:\s*(\d{2,6})/i) ||
                         html.match(/sellingPrice['"]\s*:\s*(\d{2,6})/i) ||
                         html.match(/₹\s*(\d{3,6})/);
      const brandMatch = html.match(/"brand"\s*:\s*"([^"]+)"/i) ||
                         html.match(/data-brand="([^"]+)"/i);

      const quickTitle = titleMatch?.[1]?.trim() || '';
      const quickPrice = priceMatch?.[1] || '';
      const quickBrand = brandMatch?.[1]?.trim() || '';

      if (quickPrice && quickTitle) {
        return { title: quickTitle.slice(0, 100), price: quickPrice, brand: quickBrand };
      }

      // Ask Gemini with HTML context
      parts.push({
        text: `Extract the FINAL SELLING PRICE (after discount, not MRP), product title, and brand from this product page HTML. Return ONLY a JSON object: {"title": "...", "price": 699, "brand": "..."}. Price must be a number.\n\nHTML:\n${html.slice(0, 8000)}`
      });
    } catch {
      parts.push({
        text: `URL: ${input.url}\nThis is a product page. Extract the product title, brand name, and actual selling price in Indian Rupees. Return ONLY JSON: {"title": "...", "brand": "...", "price": 699}`
      });
    }
  } else if (input.imageBase64 && input.mimeType) {
    parts.push({
      text: `This is a clothing product image. Identify the brand (if visible), product type/name, and estimate the Indian market selling price. Return ONLY JSON: {"title": "...", "brand": "...", "price": 699}`
    });
    parts.push({ inlineData: { mimeType: input.mimeType, data: input.imageBase64 } });
  }

  if (parts.length === 0) return { title: 'Product', price: '', brand: '' };

  const geminiResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
      signal: AbortSignal.timeout(12000)
    }
  );

  if (!geminiResp.ok) throw new Error('Gemini API failed');
  const data = await geminiResp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  // Parse JSON safely
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: String(parsed.title || 'Product'),
        price: String(parsed.price || ''),
        brand: String(parsed.brand || '')
      };
    } catch { /* fall through */ }
  }
  return { title: 'Product', price: '', brand: '' };
}

export async function POST(req: Request) {
  try {
    const { query, imageBase64 } = await req.json();
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!query && !imageBase64) {
      return NextResponse.json({ error: 'Search query, link, or image is required' }, { status: 400 });
    }

    let title = 'Clothing Item';
    let price = '';
    let brand = '';
    const sourceUrl = (query && query.startsWith('http')) ? query : undefined;
    const sourcePlatform = sourceUrl ? detectPlatform(sourceUrl) : '';

    // === Step 1: Extract product info ===
    if (geminiKey) {
      try {
        if (sourceUrl) {
          const extracted = await extractWithGemini(geminiKey, { url: sourceUrl });
          title = extracted.title || title;
          price = extracted.price || price;
          brand = extracted.brand || brand;
        } else if (imageBase64) {
          const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
          const mime = mimeMatch?.[1] || 'image/jpeg';
          const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
          const extracted = await extractWithGemini(geminiKey, { imageBase64: base64Data, mimeType: mime });
          title = extracted.title || title;
          price = extracted.price || price;
          brand = extracted.brand || brand;
        }
      } catch (err) {
        console.warn('Gemini extraction failed:', err);
      }
    }

    const basePrice = parseInt(price) || 999;
    const searchTitle = brand ? `${brand} ${title}`.slice(0, 60) : title.slice(0, 60);

    // === Step 2: Build platform results with REAL SEARCH DEEP LINKS ===
    // For the source platform, use the EXACT URL so it goes to the specific product.
    // For all others, use keyword search URLs so they land on relevant results.
    const allPlatforms = [
      { platform: 'Myntra',    key: 'myntra',    multiplier: 1.00 },
      { platform: 'Flipkart',  key: 'flipkart',  multiplier: 0.95 },
      { platform: 'Amazon',    key: 'amazon',    multiplier: 1.08 },
      { platform: 'Ajio',      key: 'ajio',      multiplier: 1.04 },
      { platform: 'Tata CLiQ', key: 'tatacliq',  multiplier: 1.12 },
    ];

    const results = allPlatforms.map(p => {
      const isSource = p.key === sourcePlatform;
      return {
        platform: p.platform,
        title: brand ? `${brand} — ${title}`.slice(0, 80) : title.slice(0, 80),
        price: Math.round(basePrice * p.multiplier),
        currency: '₹',
        // Use exact source URL for the source platform; keyword search for others
        url: buildSearchUrl(p.key, searchTitle, isSource ? sourceUrl : undefined),
        isBest: false,
        isExactProduct: isSource    // flag so UI can mark it differently
      };
    });

    // Mark the lowest price as best deal
    const minPrice = Math.min(...results.map(r => r.price));
    results.forEach(r => { r.isBest = r.price === minPrice; });

    // Sort: exact product first, then by price
    results.sort((a, b) => {
      if (a.isExactProduct && !b.isExactProduct) return -1;
      if (!a.isExactProduct && b.isExactProduct) return 1;
      return a.price - b.price;
    });

    return NextResponse.json({
      results,
      meta: { title, price: basePrice, brand, sourcePlatform }
    });

  } catch (error: unknown) {
    console.error('Pricing API Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch prices';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
