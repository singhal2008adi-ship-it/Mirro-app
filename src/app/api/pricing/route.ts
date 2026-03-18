import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { query, imageBase64 } = await req.json();
    const geminiKey = process.env.GEMINI_API_KEY;
    const serperKey = process.env.SERPER_API_KEY;

    if (!query && !imageBase64) return NextResponse.json({ error: 'Query or image required' }, { status: 400 });
    if (!geminiKey) return NextResponse.json({ error: 'Missing Gemini Key' }, { status: 500 });

    const sourceUrl = query?.startsWith('http') ? query : '';
    let aiResult: any = null;

    // ─── CASE A: WE HAVE A PRODUCT URL (CheckoutHub/Pasted Links) ───────────────
    if (sourceUrl) {
      let html = '';
      try {
        const resp = await fetch(sourceUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-IN,en;q=0.9',
          },
          signal: AbortSignal.timeout(8000)
        });
        html = await resp.text();
      } catch { /* Fall through to URL only */ }

      const prompt = html.length > 500
        ? `I have a product page. Here is the HTML (truncated):\n\n${html.slice(0, 8000)}\n\nThe original URL is: ${sourceUrl}\n\nPlease:\n1. Extract the product title, brand, and the actual selling price (NOT the MRP/strikethrough price - the price the customer actually pays)\n2. For each of these Indian platforms: Myntra, Flipkart, Amazon, Ajio, Tata CLiQ - give me a direct search URL for this exact product and your best estimate of what it would cost there (based on typical pricing patterns)\n3. The platform where this URL came from should use this exact original URL.\n\nReturn ONLY clean JSON in this exact format:\n{\n  "product": {\n    "title": "...",\n    "brand": "...",\n    "price": 699\n  },\n  "platforms": [\n    { "name": "Myntra", "price": 699, "url": "https://exact-product-url-or-search" },\n    { "name": "Flipkart", "price": 649, "url": "https://flipkart.com/search?q=..." }\n  ]\n}`
        : `Product URL: ${sourceUrl}\n\nPlease:\n1. Identify the product title, brand, and typical selling price in Indian Rupees\n2. For each of these Indian platforms: Myntra, Flipkart, Amazon, Ajio, Tata CLiQ - give me a search URL and estimated price\n\nReturn ONLY JSON:\n{\n  "product": { "title": "...", "brand": "...", "price": 699 },\n  "platforms": [\n    { "name": "Myntra", "price": 699, "url": "..." }\n  ]\n}`;

      const gemResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(20000)
        }
      );
      
      const data = await gemResp.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try { aiResult = JSON.parse(match[0]); } catch { /* ignore */ }
      }
    } 
    // ─── CASE B: WE HAVE AN IMAGE DIRECTLY (Virtual Try On uploaded images) ─────
    else if (imageBase64) {
      const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
      const mime = mimeMatch?.[1] || 'image/jpeg';
      const b64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
      
      const prompt = `Look at this clothing item.\n1. Identify what it is, its likely brand style, and an estimated typical selling price in Indian Rupees (INR).\n2. For each of these Indian platforms: Myntra, Flipkart, Amazon, Ajio, Tata CLiQ - give me a search URL (e.g. https://www.myntra.com/search?q=...) for this exact style of item and your best estimated price for them.\n\nReturn ONLY exact JSON format:\n{\n  "product": { "title": "...", "brand": "...", "price": 699 },\n  "platforms": [\n    { "name": "Myntra", "price": 699, "url": "..." }\n  ]\n}`;

      const descResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: prompt },
              { inlineData: { mimeType: mime, data: b64 } }
            ]}]
          }),
          signal: AbortSignal.timeout(20000)
        }
      );
      
      const data = await descResp.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try { aiResult = JSON.parse(match[0]); } catch { /* ignore */ }
      }
    }

    // Process results to match the frontend expectations of CheckoutHub
    if (!aiResult || !aiResult.product) {
       aiResult = { product: { title: 'Clothing Item', brand: '', price: 999 }, platforms: [] };
    }

    let results = (aiResult.platforms || []).map((p: any) => ({
      platform: p.name,
      price: Number(p.price) || aiResult.product.price,
      url: p.url || '',
      currency: '₹',
      isBest: false,
      isFromSearch: false // Not from Google Shopping
    }));

    // ─── Optional: If Serper Key is available, do a Google Shopping Search ──────
    // The previous implementation used Serper. If the user wants the AI-only
    // approach to just provide the frontend data, we will return the AI results directly.
    // However, to keep it robust and identical to the requested logic, we can still fetch Serper
    // and replace matching AI prices with REAL Google Shopping prices if found.
    const searchTitle = `${aiResult.product.brand || ''} ${aiResult.product.title}`.trim();
    if (serperKey && searchTitle.length > 3) {
      try {
        const serperResp = await fetch('https://google.serper.dev/shopping', {
          method: 'POST',
          headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: searchTitle + ' buy india', gl: 'in', hl: 'en', num: 15 }),
          signal: AbortSignal.timeout(8000)
        });
        
        if (serperResp.ok) {
          const serperData = await serperResp.json();
          const items = serperData.shopping || [];
          
          for (const item of items) {
            const source = (item.source || '').toLowerCase();
            const link = item.link || item.url || '';
            const priceStr = String(item.price || '').replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
            const price = parseFloat(priceStr);
            if (!price || price < 50) continue;
            
            // Map serper source to our platforms
            let matchedPlatform = '';
            if (source.includes('myntra') || link.includes('myntra')) matchedPlatform = 'Myntra';
            else if (source.includes('flipkart') || link.includes('flipkart')) matchedPlatform = 'Flipkart';
            else if (source.includes('amazon') || link.includes('amazon')) matchedPlatform = 'Amazon';
            else if (source.includes('ajio') || link.includes('ajio')) matchedPlatform = 'Ajio';
            else if (source.includes('tata') || link.includes('tatacliq')) matchedPlatform = 'Tata CLiQ';
            
            if (matchedPlatform) {
              const existing = results.find((r: any) => r.platform.toLowerCase() === matchedPlatform.toLowerCase());
              if (existing) {
                // Keep the exact source URL instead of replacing it with a Serper tracking link,
                // but UPDATE the price to the real Serper price if it's lower.
                if (price < existing.price) {
                  existing.price = price;
                  existing.isFromSearch = true; // Mark as live price
                }
              } else {
                 results.push({
                   platform: matchedPlatform,
                   price: price,
                   url: link, // Unseen platform, use serper link
                   currency: '₹',
                   isBest: false,
                   isFromSearch: true
                 });
              }
            }
          }
        }
      } catch (e) {
        console.warn('Serper fetch failed', e);
      }
    }

    // Ensure source URL is used accurately and not lost
    if (sourceUrl) {
      const sourceName = sourceUrl.includes('myntra') ? 'myntra' 
        : sourceUrl.includes('flipkart') ? 'flipkart'
        : sourceUrl.includes('amazon') ? 'amazon'
        : sourceUrl.includes('ajio') ? 'ajio'
        : '';
      
      const target = results.find((r: any) => r.platform.toLowerCase() === sourceName);
      if (target) {
        target.url = sourceUrl;
      }
    }

    // Sort and mark best
    if (results.length > 0) {
      results.sort((a: any, b: any) => a.price - b.price);
      const minPrice = results[0].price;
      results.forEach((r: any) => { r.isBest = (r.price === minPrice) });
    }

    return NextResponse.json({
      results: results.slice(0, 6),
      meta: { 
        title: aiResult.product.title, 
        price: aiResult.product.price, 
        brand: aiResult.product.brand, 
        searchedWith: searchTitle, 
        usedGoogleShopping: results.some((r: any) => r.isFromSearch) 
      }
    });

  } catch (error: unknown) {
    console.error('[Pricing] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}
