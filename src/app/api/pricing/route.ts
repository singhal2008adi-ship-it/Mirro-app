import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    const rapidApiKey = process.env.RAPIDAPI_KEY;

    if (!rapidApiKey) {
      console.warn("RAPIDAPI_KEY is missing. Using mock data.");
    }

    if (!query) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    // Attempting to call RapidAPI endpoint (Mocking fallback as requested for Demo)
    console.log("Fetching price data for:", query);

    const mockPriceData = [
      {
        platform: "Amazon",
        price: 49.99,
        currency: "$",
        url: "https://amazon.com",
        isBest: false
      },
      {
        platform: "Myntra",
        price: 45.99,
        currency: "$",
        url: "https://myntra.com",
        isBest: true
      },
      {
        platform: "Zara",
        price: 59.90,
        currency: "$",
        url: "https://zara.com",
        isBest: false
      }
    ];

    return NextResponse.json({ results: mockPriceData });
  } catch (error) {
    console.error("Pricing API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}
