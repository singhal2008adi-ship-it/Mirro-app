import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { basePhotoUrl, targetImageUrl } = await req.json();
    const hfToken = process.env.HF_API_TOKEN;

    if (!basePhotoUrl || !targetImageUrl) {
      return NextResponse.json({ error: 'Both base and target images are required' }, { status: 400 });
    }

    if (!hfToken) {
      console.warn("HF_API_TOKEN is missing. Returning simulated result.");
      // Simulated processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      return NextResponse.json({ 
        result: targetImageUrl, // Just return target for simulation
        simulated: true,
        message: "Configure HF_API_TOKEN for real AI try-on"
      });
    }

    // Correct Hugging Face Inference API call
    console.log("Calling HF Try-On API with base:", basePhotoUrl, "and target:", targetImageUrl);

    try {
      // Use the router as suggested by HF error messages
      const response = await fetch(
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
              "background": basePhotoUrl,
              "garment": targetImageUrl
            }
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`HF API Error (Status ${response.status}):`, errorText);
        throw new Error(`HF API: ${response.statusText || "Error"}`);
      }

      // If successful, the API often returns the binary image content
      const buffer = await response.arrayBuffer();
      const base64Image = Buffer.from(buffer).toString('base64');
      const resultDataUrl = `data:image/png;base64,${base64Image}`;

      return NextResponse.json({ 
        result: resultDataUrl, 
        message: "AI Try-On Generated Successfully" 
      });

    } catch (apiError) {
      console.warn("Falling back to garment preview due to HF API availability.");
      
      // Fallback: Return the garment image itself so the user sees something 
      // instead of a crash, but label it as a preview.
      return NextResponse.json({ 
        result: targetImageUrl, 
        isFallback: true,
        message: "Model Busy: Showing high-quality garment preview. Try again in 1 minute for AI generation." 
      });
    }
  } catch (error: unknown) {
    console.error("Try-on API Error:", error);
    const message = error instanceof Error ? error.message : 'Failed to process try-on';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

