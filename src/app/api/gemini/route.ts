import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: Request) {
  try {
    const { imageUrl } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    if (!apiKey) {
      console.warn("GEMINI_API_KEY is missing. Returning mock data.");
      return NextResponse.json({
        description: "A stylish blue denim jacket with silver buttons (Mock)",
        category: "Outerwear",
        color: "Blue",
        material: "Denim"
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = "Analyze this clothing item and provide a brief description, its category (e.g., Top, Bottom, Outerwear, Accessory), its primary color, and its material. Return the response as a JSON object with keys: description, category, color, material.";

    // Since we receive an imageUrl, we need to fetch the image and convert it to a generative part
    const imageResp = await fetch(imageUrl).then(res => res.arrayBuffer());
    
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: Buffer.from(imageResp).toString('base64'),
          mimeType: "image/jpeg"
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();
    
    // Clean up response text if it contains markdown JSON blocks
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const metadata = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);

    return NextResponse.json(metadata);
  } catch (error) {
    console.error("Gemini API Error:", error);
    return NextResponse.json({ error: 'Failed to extract metadata' }, { status: 500 });
  }
}
