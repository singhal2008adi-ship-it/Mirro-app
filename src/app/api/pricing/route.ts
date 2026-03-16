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
        const response = await fetch(query, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        const html = await response.text();
        const $ = cheerio.load(html);

        // Basic selection for Myntra (they often use structured data or specific classes)
        const title = $('.pdp-title').text() || $('.pdp-name').text() || 'Product';
        const price = $('.pdp-price strong').text() || $('.pdp-price').first().text() || 'N/A';
        const image = $('.pdp-main-image').attr('src') || '';

        return NextResponse.json({
          results: [
            {
              platform: "Myntra",
              title: title,
              price: price,
              currency: "₹",
              url: query,
              image: image,
              isBest: true
            }
          ]
        });
      } catch (scrapeError) {
        console.error("Scraping error:", scrapeError);
        // Fallback to mock if scrape fails
      }
    }

    // Default mock data for search queries
    const mockPriceData = [
      {
        platform: "Amazon",
        title: "Casual Cotton Shirt",
        price: 999,
        currency: "₹",
        url: "https://amazon.in",
        isBest: false
      },
      {
        platform: "Myntra",
        title: "Roadster Casual Shirt",
        price: 899,
        currency: "₹",
        url: "https://myntra.com",
        isBest: true
      }
    ];

    return NextResponse.json({ results: mockPriceData });
  } catch (error) {
    console.error("Pricing API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}
