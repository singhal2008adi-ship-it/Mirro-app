import { NextResponse } from 'next/server';

// ─── Step 1: Extract product title + price from the source URL ───────────────
async function extractProductFromUrl(url: string, geminiKey: string): Promise<{ title: string; price: number; brand: string; sourceUrl: string }> {
  // Fetch the product page HTML
  let html = '';
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000)
    });
    html = await resp.text();
  } catch { /* fall through to Gemini-only */ }

  // Ask Gemini to extract from HTML
  const prompt = html.length > 100
    ? `Extract from this product page HTML: product title, brand name, and final SELLING price (NOT MRP/strikethrough, only the actual price the customer pays). Return ONLY JSON: {"title":"...","brand":"...","price":699}\n\nHTML (truncated):\n${html.slice(0, 10000)}`
    : `This is a product URL: ${url}\nExtract product title, brand, and selling price in INR. Return ONLY JSON: {"title":"...","brand":"...","price":699}`;

  const gemResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(12000)
    }
  );

  if (!gemResp.ok) return { title: 'Clothing Item', price: 999, brand: '', sourceUrl: url };
  const data = await gemResp.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const jsonMatch = raw.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const p = JSON.parse(jsonMatch[0]);
      return {
        title: String(p.title || 'Clothing Item'),
        price: Number(p.price) || 999,
        brand: String(p.brand || ''),
        sourceUrl: url
      };
    } catch { /* fall through */ }
  }
  return { title: 'Clothing Item', price: 999, brand: '', sourceUrl: url };
}

// ─── Step 2: Search Google Shopping for real prices & product URLs ────────────
async function searchGoogleShopping(searchQuery: string, serperKey: string): Promise<Array<{ platform: string; price: number; url: string; title: string }>> {
  const resp = await fetch('https://google.serper.dev/shopping', {
    method: 'POST',
    headers: {
      'X-API-KEY': serperKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: searchQuery + ' buy india',
      gl: 'in',      // India
      hl: 'en',
      num: 20
    }),
    signal: AbortSignal.timeout(8000)
  });

  if (!resp.ok) {
    console.warn('[Pricing] Serper API failed:', resp.status);
    return [];
  }

  const data = await resp.json();
  const items: Array<{ platform: string; price: number; url: string; title: string }> = [];

  // Target Indian e-commerce platforms
  const targetPlatforms: Record<string, string> = {
    'myntra.com': 'Myntra',
    'flipkart.com': 'Flipkart',
    'amazon.in': 'Amazon',
    'ajio.com': 'Ajio',
    'tatacliq.com': 'Tata CLiQ',
    'nykaa.com': 'Nykaa Fashion',
    'meesho.com': 'Meesho',
    'snapdeal.com': 'Snapdeal',
  };

  for (const item of (data.shopping || [])) {
    const source = item.source?.toLowerCase() || '';
    const link = item.link || item.url || '';
    let platform = '';
    for (const [domain, name] of Object.entries(targetPlatforms)) {
      if (source.includes(domain) || link.includes(domain)) {
        platform = name;
        break;
      }
    }
    if (!platform) continue;

    // Parse price - remove ₹, commas, etc.
    const priceStr = String(item.price || '').replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
    const price = parseFloat(priceStr);
    if (!price || price < 100 || price > 50000) continue;

    // Avoid duplicate platforms - keep lowest price
    const existing = items.find(i => i.platform === platform);
    if (existing) {
      if (price < existing.price) { existing.price = price; existing.url = link; }
    } else {
      items.push({ platform, price, url: link, title: item.title || '' });
    }
  }

  return items.sort((a, b) => a.price - b.price);
}

// ─── Fallback: deterministic price estimates if no Serper results ─────────────
function buildFallbackPrices(basePrice: number, sourceUrl: string, searchTitle: string) {
  const q = encodeURIComponent(searchTitle);
  const platform = (url: string, domain: string) => sourceUrl.includes(domain) ? sourceUrl : '';

  return [
    { platform: 'Myntra',    title: searchTitle, price: basePrice,                    url: platform(sourceUrl, 'myntra') || `https://www.myntra.com/${q}`,                        isBest: false, isFromSearch: false },
    { platform: 'Flipkart',  title: searchTitle, price: Math.round(basePrice * 0.95), url: platform(sourceUrl, 'flipkart') || `https://www.flipkart.com/search?q=${q}`,           isBest: false, isFromSearch: false },
    { platform: 'Amazon',    title: searchTitle, price: Math.round(basePrice * 1.08), url: platform(sourceUrl, 'amazon') || `https://www.amazon.in/s?k=${q}`,                     isBest: false, isFromSearch: false },
    { platform: 'Ajio',      title: searchTitle, price: Math.round(basePrice * 1.04), url: platform(sourceUrl, 'ajio') || `https://www.ajio.com/search/?text=${q}`,               isBest: false, isFromSearch: false },
    { platform: 'Tata CLiQ', title: searchTitle, price: Math.round(basePrice * 1.12), url: `https://www.tatacliq.com/search/?searchCategory=all&text=${q}`,                      isBest: false, isFromSearch: false },
  ];
}

export async function POST(req: Request) {
  try {
    const { query, imageBase64 } = await req.json();
    const geminiKey = process.env.GEMINI_API_KEY;
    const serperKey = process.env.SERPER_API_KEY;

    if (!query && !imageBase64) return NextResponse.json({ error: 'Query or image required' }, { status: 400 });

    let title = 'Clothing Item';
    let price = 999;
    let brand = '';
    const sourceUrl = query?.startsWith('http') ? query : '';

    // ─── Extract product details from URL via HTML + Gemini ───────────────────
    if (sourceUrl && geminiKey) {
      const extracted = await extractProductFromUrl(sourceUrl, geminiKey);
      title = extracted.title;
      price = extracted.price;
      brand = extracted.brand;
    } else if (imageBase64 && geminiKey) {
      const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
      const mime = mimeMatch?.[1] || 'image/jpeg';
      const b64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
      const descResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: 'Identify brand, product name, and approximate Indian market selling price. Return ONLY JSON: {"title":"...","brand":"...","price":699}' },
              { inlineData: { mimeType: mime, data: b64 } }
            ]}]
          }),
          signal: AbortSignal.timeout(12000)
        }
      );
      if (descResp.ok) {
        const descData = await descResp.json();
        const raw = descData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const m = raw.match(/\{[\s\S]*?\}/);
        if (m) try { const p = JSON.parse(m[0]); title = p.title || title; price = Number(p.price) || price; brand = p.brand || brand; } catch { /* */ }
      }
    } else if (query && !query.startsWith('http')) {
      title = query;
    }

    const searchTitle = brand ? `${brand} ${title}`.slice(0, 80) : title.slice(0, 80);

    // ─── Search Google Shopping for REAL prices ─────────────────────────────
    let results: Array<{ platform: string; price: number; url: string; title: string; isBest: boolean; isFromSearch: boolean; currency: string }> = [];

    if (serperKey && searchTitle !== 'Clothing Item') {
      console.log('[Pricing] Searching Google Shopping for:', searchTitle);
      const shoppingResults = await searchGoogleShopping(searchTitle, serperKey);
      console.log('[Pricing] Found', shoppingResults.length, 'Google Shopping results');

      if (shoppingResults.length > 0) {
        // If user provided source URL: override that platform's price+url with the exact source
        results = shoppingResults.map(r => ({
          ...r,
          // Use exact source URL for matching platform
          url: sourceUrl && (
            (r.platform === 'Myntra' && sourceUrl.includes('myntra')) ||
            (r.platform === 'Flipkart' && sourceUrl.includes('flipkart')) ||
            (r.platform === 'Amazon' && sourceUrl.includes('amazon'))
          ) ? sourceUrl : r.url,
          isBest: false,
          isFromSearch: true,
          currency: '₹'
        }));
      }
    }

    // Fill in missing platforms with fallback + ensure source platform is always present
    const fallbacks = buildFallbackPrices(price, sourceUrl, searchTitle);
    const presentPlatforms = new Set(results.map(r => r.platform));

    for (const fb of fallbacks) {
      if (!presentPlatforms.has(fb.platform)) {
        results.push({ ...fb, currency: '₹', isFromSearch: false });
      }
    }

    // Ensure source URL platform exists and uses the exact URL
    if (sourceUrl) {
      const sourcePlatform = sourceUrl.includes('myntra') ? 'Myntra'
        : sourceUrl.includes('flipkart') ? 'Flipkart'
        : sourceUrl.includes('amazon') ? 'Amazon'
        : sourceUrl.includes('ajio') ? 'Ajio'
        : '';
      if (sourcePlatform) {
        const existing = results.find(r => r.platform === sourcePlatform);
        if (existing) existing.url = sourceUrl;
      }
    }

    // Sort by price and mark best
    results.sort((a, b) => a.price - b.price);
    const minPrice = Math.min(...results.map(r => r.price));
    results.forEach(r => { r.isBest = r.price === minPrice; });

    return NextResponse.json({
      results: results.slice(0, 6),
      meta: { title, price, brand, searchedWith: searchTitle, usedGoogleShopping: !!serperKey }
    });

  } catch (error: unknown) {
    console.error('[Pricing] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}
