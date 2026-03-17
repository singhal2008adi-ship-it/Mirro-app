import { NextResponse } from 'next/server';

const VTON_SPACE = 'https://yisol-idm-vton.hf.space';

// Compress a base64 image to stay within API limits (max ~1MB)
async function compressBase64Image(base64: string, mimeType: string): Promise<string> {
  // If already small enough, return as-is
  if (base64.length < 800000) return base64;
  
  // For large images, we'll just truncate here — in production this would use canvas
  // But since this runs server-side (Node.js) we use a different approach:
  // Decode → re-encode at reduced quality via sharp or just return original
  // For now return original (Gemini handles up to 20MB)
  return base64;
}

async function uploadToSpace(base64Data: string, mimeType: string, hfToken?: string): Promise<string> {
  const buf = Buffer.from(base64Data, 'base64');
  const ext = mimeType.split('/')[1] || 'jpg';
  const blob = new Blob([buf], { type: mimeType });
  const formData = new FormData();
  formData.append('files', blob, `image.${ext}`);
  const headers: Record<string, string> = {};
  if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;
  const resp = await fetch(`${VTON_SPACE}/upload`, { method: 'POST', headers, body: formData, signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
  const json = await resp.json();
  return json[0];
}

export async function POST(req: Request) {
  try {
    const { basePhotoData, garmentImageData } = await req.json();
    const hfToken = process.env.HF_API_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!basePhotoData || !garmentImageData) {
      return NextResponse.json({ error: 'Both person and garment images are required' }, { status: 400 });
    }

    const parseDataUrl = (dataUrl: string | null) => {
      if (!dataUrl) return null;
      const match = dataUrl.trim().match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!match) return null;
      return { mimeType: match[1], data: match[2].trim() };
    };

    const baseImg = parseDataUrl(basePhotoData);
    const garmentImg = parseDataUrl(garmentImageData);

    if (!baseImg) return NextResponse.json({ result: basePhotoData, isFallback: true, engine: 'Fallback', message: 'Invalid person photo.' });
    if (!garmentImg) return NextResponse.json({ result: basePhotoData, isFallback: true, engine: 'Fallback', message: 'Invalid garment image.' });

    // ─── ENGINE A: IDM-VTON Space (Best — dedicated VTON diffusion model) ─────
    if (hfToken) {
      console.log('[Try-On] Attempting IDM-VTON...');
      try {
        const [personPath, garmentPath] = await Promise.all([
          uploadToSpace(baseImg.data, baseImg.mimeType, hfToken),
          uploadToSpace(garmentImg.data, garmentImg.mimeType, hfToken)
        ]);
        const sessionHash = Math.random().toString(36).slice(2);
        const joinResp = await fetch(`${VTON_SPACE}/queue/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fn_index: 0, session_hash: sessionHash,
            data: [
              { background: { path: personPath, url: `${VTON_SPACE}/file=${personPath}`, orig_name: 'person.jpg', mime_type: baseImg.mimeType }, layers: [], composite: null },
              { path: garmentPath, url: `${VTON_SPACE}/file=${garmentPath}`, orig_name: 'garment.jpg', mime_type: garmentImg.mimeType },
              'clothing item', true, false, 20, 42
            ]
          }),
          signal: AbortSignal.timeout(10000)
        });
        if (joinResp.ok) {
          const { event_id } = await joinResp.json();
          const statusResp = await fetch(`${VTON_SPACE}/queue/data?session_hash=${event_id}`, { signal: AbortSignal.timeout(90000) });
          if (statusResp.ok) {
            const text = await statusResp.text();
            for (const line of text.split('\n')) {
              if (!line.startsWith('data:')) continue;
              try {
                const msg = JSON.parse(line.slice(5));
                if (msg.msg === 'process_completed' && msg.output?.data?.[0]) {
                  const ref = msg.output.data[0];
                  const url = ref?.url || (ref?.path ? `${VTON_SPACE}/file=${ref.path}` : '');
                  if (url) {
                    const f = await fetch(url, { signal: AbortSignal.timeout(20000) });
                    if (f.ok) {
                      const b = await f.arrayBuffer();
                      const ct = f.headers.get('content-type') || 'image/png';
                      return NextResponse.json({ result: `data:${ct};base64,${Buffer.from(b).toString('base64')}`, engine: 'IDM-VTON', isFallback: false, message: '✨ Virtual try-on by IDM-VTON AI!' });
                    }
                  }
                  break;
                }
              } catch { /* skip */ }
            }
          }
        }
      } catch (e) { console.warn('[Try-On] IDM-VTON failed:', e); }
    }

    // ─── ENGINE B: Gemini 3 Pro Image (Same model as Gemini website) ──────────
    // This is what gemini.google.com uses — supports multi-image + image output
    // Uses the EXACT same natural language prompt you used on the website
    if (geminiKey) {
      const imageModels = ['gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image'];
      
      for (const model of imageModels) {
        console.log(`[Try-On] Trying ${model}...`);
        try {
          const editResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    // Natural, conversational prompt — same style as Gemini website
                    { text: 'The first image is the person and the second image is the clothing item. Extract the clothing from the second image and generate a realistic photo of the first person wearing exactly that clothing item. Keep the person face, body, background identical. This is a virtual try-on.' },
                    { inlineData: { mimeType: baseImg.mimeType, data: baseImg.data } },
                    { inlineData: { mimeType: garmentImg.mimeType, data: garmentImg.data } }
                  ]
                }],
                generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
              }),
              signal: AbortSignal.timeout(60000)
            }
          );

          if (editResp.ok) {
            const editData = await editResp.json();
            const imgPart = editData.candidates?.[0]?.content?.parts?.find(
              (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData
            );
            if (imgPart?.inlineData?.data) {
              console.log(`[Try-On] ${model} SUCCESS! (${imgPart.inlineData.data.length} chars)`);
              return NextResponse.json({
                result: `data:${imgPart.inlineData.mimeType || 'image/png'};base64,${imgPart.inlineData.data}`,
                engine: model.includes('3-pro') ? 'Gemini 3 Pro' : model.includes('3.1') ? 'Gemini 3.1' : 'Gemini Image',
                isFallback: false,
                message: '✨ Virtual try-on generated!'
              });
            }
            const textPart = editData.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text);
            const reason = editData.candidates?.[0]?.finishReason;
            console.warn(`[Try-On] ${model} no image. Reason: ${reason}, Text: ${textPart?.text?.slice(0, 80)}`);
          } else {
            const errText = await editResp.text().catch(() => '');
            console.warn(`[Try-On] ${model} HTTP ${editResp.status}:`, errText.slice(0, 100));
          }
        } catch (e) {
          console.warn(`[Try-On] ${model} error:`, e);
        }
      }
    }

    // ─── ENGINE C: Gemini Stylist text fallback ────────────────────────────────
    if (geminiKey) {
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [
              { text: 'In 2 sentences, how would this clothing item look on this person? Be specific.' },
              { inlineData: { mimeType: baseImg.mimeType, data: baseImg.data } },
              { inlineData: { mimeType: garmentImg.mimeType, data: garmentImg.data } }
            ]}] }),
            signal: AbortSignal.timeout(10000)
          }
        );
        if (r.ok) {
          const d = await r.json();
          const note = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          return NextResponse.json({ result: basePhotoData, engine: 'Gemini Stylist', isFallback: true, message: note ? `✨ Style: ${note}` : 'AI engines busy. Try again.' });
        }
      } catch { /* silent */ }
    }

    return NextResponse.json({ result: basePhotoData, engine: 'Preview', isFallback: true, message: 'AI engines are warming up. Try again.' });

  } catch (err: unknown) {
    console.error('[Try-On] Error:', err);
    return NextResponse.json({ error: 'Failed to process try-on' }, { status: 500 });
  }
}
