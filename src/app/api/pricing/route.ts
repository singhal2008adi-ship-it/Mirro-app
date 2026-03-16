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

        return NextResponse.json({
          results: [
            {
              platform: "Myntra",
              title: title.trim(),
              price: parseInt(price as string) || price,
              currency: "₹",
              url: query,
              image: image,
              isBest: true
            },
            {
              platform: "Amazon",
              title: title.trim(),
              price: (parseInt(price as string) || 1000) + 150,
              currency: "₹",
              url: "https://amazon.in",
              isBest: false
            }
          ]
        });
      } catch (scrapeError: unknown) {
        console.error("Scraping error:", scrapeError);
        // Fallback below
      }
    }

    // Default mock data for search queries or failed scrapes
    const mockPriceData = [
      {
        platform: "Amazon",
        title: query.length < 50 ? `Product: ${query}` : "Casual Cotton Shirt",
        price: 999,
        currency: "₹",
        url: "https://amazon.in",
        isBest: false
      },
      {
        platform: "Myntra",
        title: query.length < 50 ? `Product: ${query}` : "Roadster Casual Shirt",
        price: 899,
        currency: "₹",
        url: "https://myntra.com",
        isBest: true
      }
    ];

    return NextResponse.json({ results: mockPriceData });
  } catch (error: unknown) {
    console.error("Pricing API Error:", error);
    const message = error instanceof Error ? error.message : 'Failed to fetch prices';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
