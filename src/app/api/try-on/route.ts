import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { basePhotoData, targetImageData, targetIsLink } = await req.json();
    const hfToken = process.env.HF_API_TOKEN;

    if (!basePhotoData || !targetImageData) {
      return NextResponse.json({ error: 'Both base and target images are required' }, { status: 400 });
    }

    // Helper: extract base64 content from a data URL
    const extractBase64 = (dataUrl: string) => {
      const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      return match ? { mimeType: match[1], data: match[2] } : null;
    };

    // Helper: fetch an image from a URL and return base64
    const fetchImageAsBase64 = async (url: string) => {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MirroApp/1.0)' }
      });
      if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
      const buffer = await resp.arrayBuffer();
      const b64 = Buffer.from(buffer).toString('base64');
      const contentType = resp.headers.get('content-type') || 'image/jpeg';
      return { mimeType: contentType, data: b64 };
    };

    // Resolve base photo — always should be base64 from client
    let baseB64: { mimeType: string; data: string } | null = null;
    if (basePhotoData.startsWith('data:')) {
      baseB64 = extractBase64(basePhotoData);
    } else {
      baseB64 = await fetchImageAsBase64(basePhotoData);
    }

    // Resolve garment image — may be base64 or a URL
    let targetB64: { mimeType: string; data: string } | null = null;
    if (targetIsLink) {
      // It's a Myntra/product link — try to extract OG image
      try {
        const pageResp = await fetch(targetImageData, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MirroApp/1.0)' }
        });
        const html = await pageResp.text();
        const ogMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
        if (ogMatch?.[1]) {
          targetB64 = await fetchImageAsBase64(ogMatch[1]);
        }
      } catch {
        console.warn('Could not extract product image from link');
      }
    } else if (targetImageData.startsWith('data:')) {
      targetB64 = extractBase64(targetImageData);
    } else {
      targetB64 = await fetchImageAsBase64(targetImageData);
    }

    if (!baseB64 || !targetB64) {
      return NextResponse.json({
        result: basePhotoData,
        isFallback: true,
        engine: "Fallback",
        message: "Could not resolve images. Showing your original photo."
      });
    }

    // === ENGINE A: Hugging Face (IDM-VTON — Specialized Virtual Try-On) ===
    if (hfToken) {
      console.log("Attempting HF IDM-VTON...");
      try {
        const hfResponse = await fetch(
          "https://router.huggingface.co/hf-inference/models/yisol/IDM-VTON",
          {
            headers: {
              Authorization: `Bearer ${hfToken}`,
              "Content-Type": "application/json",
              "x-wait-for-model": "true"
            },
            method: "POST",
            body: JSON.stringify({
              inputs: {
                background: `data:${baseB64.mimeType};base64,${baseB64.data}`,
                garment: `data:${targetB64.mimeType};base64,${targetB64.data}`
              }
            }),
          }
        );

        if (hfResponse.ok) {
          const contentType = hfResponse.headers.get('content-type') || 'image/png';
          const buffer = await hfResponse.arrayBuffer();
          const base64Image = Buffer.from(buffer).toString('base64');
          return NextResponse.json({
            result: `data:${contentType};base64,${base64Image}`,
            engine: "Hugging Face (AI Try-On)",
            isFallback: false,
            message: "AI Virtual Try-On generated successfully!"
          });
        } else {
          const errText = await hfResponse.text();
          console.warn(`HF failed (${hfResponse.status}): ${errText}`);
        }
      } catch (hfError) {
        console.warn("HF Engine error:", hfError);
      }
    }

    // === ENGINE B: Gemini Vision — Composite Try-On ===
    // Use Gemini to describe the garment and overlay concept
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      console.log("Attempting Gemini Vision composite...");
      try {
        const geminiResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    text: `You are a virtual try-on assistant. Analyze these two images: the first is a person's photo, the second is a clothing item. Describe in 1-2 sentences how the person would look wearing this clothing, focusing on fit, style and color combinations.`
                  },
                  {
                    inlineData: { mimeType: baseB64.mimeType, data: baseB64.data }
                  },
                  {
                    inlineData: { mimeType: targetB64.mimeType, data: targetB64.data }
                  }
                ]
              }]
            })
          }
        );

        if (geminiResp.ok) {
          const geminiData = await geminiResp.json();
          const description = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          
          // Return user's base photo with Gemini's style description
          return NextResponse.json({
            result: basePhotoData, // Show the actual person
            engine: "Gemini AI Preview",
            isFallback: true,
            message: `✨ AI Style Analysis: ${description}`
          });
        }
      } catch (geminiError) {
        console.warn("Gemini error:", geminiError);
      }
    }

    // === FINAL FALLBACK: Show person's photo with message ===
    return NextResponse.json({
      result: basePhotoData,
      isFallback: true,
      engine: "Preview Mode",
      message: "AI engines are warming up (free tier). Your photo is shown. Try again shortly for full try-on."
    });

  } catch (error: unknown) {
    console.error("Try-on API Error:", error);
    const message = error instanceof Error ? error.message : 'Failed to process try-on';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
