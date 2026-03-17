import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json({ error: 'Search query or link is required' }, { status: 400 });
    }

    // Check if query is a Myntra link
    if (query.includes('myntra.com')) {
      try {
        console.log("Scraping Myntra for:", query);
        const response = await fetch(query, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          }
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const html = await response.text();
        const $ = cheerio.load(html);

        // Myntra uses JSON-LD or script tags for product data which is more reliable
        let title = '';
        let price: string | number = '';
        let image = '';

        const scriptTag = $('script:contains("pdpData")').html();
        if (scriptTag) {
          try {
            const pdpData = JSON.parse(scriptTag.split('window.__myntra_app_pdp_state__ = ')[1].split(';')[0]);
            title = pdpData.productDetails.name;
            price = pdpData.productDetails.mrp;
            image = pdpData.productDetails.media.albums[0].images[0].src;
          } catch {
            console.warn("Failed to parse Myntra JSON-LD, falling back to CSS selectors");
          }
        }

        if (!title) {
          title = $('.pdp-title').text() || $('.pdp-name').text() || 'Product';
          price = $('.pdp-price strong').first().text().replace(/[^\d]/g, '') || 'N/A';
          image = $('.pdp-main-image').attr('src') || '';
        }

        const basePrice = parseInt(price as string) || 999;
        
        const myntraPrice = basePrice;
        const amazonPrice = basePrice + 150;
        const flipkartPrice = basePrice - 50; 
        const ajioPrice = basePrice + 50;
        const tatacliqPrice = basePrice + 200;

        const allPrices = [
          { platform: "Myntra", price: myntraPrice, title: title.trim(), url: query },
          { platform: "Amazon", price: amazonPrice, title: title.trim(), url: "https://amazon.in" },
          { platform: "Flipkart", price: flipkartPrice, title: title.trim(), url: "https://flipkart.com" },
          { platform: "Ajio", price: ajioPrice, title: title.trim(), url: "https://ajio.com" },
          { platform: "TataCliq", price: tatacliqPrice, title: title.trim(), url: "https://tatacliq.com" }
        ];

        const minPrice = Math.min(...allPrices.map(p => p.price));

        const formattedResults = allPrices.map(p => ({
          ...p,
          currency: "₹",
          image: p.platform === "Myntra" ? image : "", // Main image from Myntra
          isBest: p.price === minPrice
        }));

        return NextResponse.json({ results: formattedResults });
      } catch (scrapeError: unknown) {
        console.error("Scraping error:", scrapeError);
        // Fallback below
      }
    }

    // Default mock data for search queries or failed scrapes
    const baseMockPrice = 899;
    const allMockPrices = [
      { platform: "Amazon", title: query.length < 50 ? `${query}` : "Casual Shirt", price: baseMockPrice + 100, url: "https://amazon.in" },
      { platform: "Myntra", title: query.length < 50 ? `${query}` : "Roadster Casual Shirt", price: baseMockPrice, url: "https://myntra.com" },
      { platform: "Flipkart", title: query.length < 50 ? `${query}` : "Casual Shirt", price: baseMockPrice - 30, url: "https://flipkart.com" },
      { platform: "Ajio", title: query.length < 50 ? `${query}` : "Premium Shirt", price: baseMockPrice + 50, url: "https://ajio.com" },
      { platform: "TataCliq", title: query.length < 50 ? `${query}` : "Casual Shirt", price: baseMockPrice + 150, url: "https://tatacliq.com" }
    ];

    const minMockPrice = Math.min(...allMockPrices.map(p => p.price));
    
    const formattedMockResults = allMockPrices.map(p => ({
        ...p,
        currency: "₹",
        isBest: p.price === minMockPrice
    }));

    return NextResponse.json({ results: formattedMockResults });
  } catch (error: unknown) {
    console.error("Pricing API Error:", error);
    const message = error instanceof Error ? error.message : 'Failed to fetch prices';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
