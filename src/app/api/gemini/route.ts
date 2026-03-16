import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { imageUrl } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing. Using mock data.");
    }

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    // Google Gemini API call (mocked for prototype or waiting for actual API key usage)
    console.log("Calling Gemini API for metadata extraction on:", imageUrl);

    // Mock response for now
    const mockMetadata = {
      description: "A stylish blue denim jacket with silver buttons.",
      category: "Outerwear",
      color: "Blue",
      material: "Denim"
    };

    return NextResponse.json(mockMetadata);
  } catch (error) {
    console.error("Gemini API Error:", error);
    return NextResponse.json({ error: 'Failed to extract metadata' }, { status: 500 });
  }
}
