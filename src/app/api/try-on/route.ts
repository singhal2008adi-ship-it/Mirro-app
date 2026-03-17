import { NextResponse } from 'next/server';

const VTON_SPACE = 'https://yisol-idm-vton.hf.space';

// Upload a base64 image to the HF Space and get back a file path token
async function uploadToSpace(base64Data: string, mimeType: string, hfToken?: string): Promise<string> {
  const buf = Buffer.from(base64Data, 'base64');
  const ext = mimeType.split('/')[1] || 'jpg';
  const blob = new Blob([buf], { type: mimeType });
  const formData = new FormData();
  formData.append('files', blob, `image.${ext}`);

  const headers: Record<string, string> = {};
  if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;

  const resp = await fetch(`${VTON_SPACE}/upload`, { method: 'POST', headers, body: formData });
  if (!resp.ok) throw new Error(`Space upload failed: ${resp.status}`);
  const json = await resp.json();
  // Returns array of file paths
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

    // ───── ENGINE A: IDM-VTON via Gradio Space API (Best Quality) ─────
    // This is a specialized virtual try-on model that faithfully preserves
    // garment texture, color, logo, and overlays it realistically on the person.
    console.log('[Try-On] Attempting IDM-VTON via Gradio Space...');
    try {
      // Step 1: Upload both images to the Space filesystem
      const [personPath, garmentPath] = await Promise.all([
        uploadToSpace(baseImg.data, baseImg.mimeType, hfToken),
        uploadToSpace(garmentImg.data, garmentImg.mimeType, hfToken)
      ]);
      console.log('[Try-On] Uploaded person:', personPath, '| garment:', garmentPath);

      // Step 2: Use Gradio queue protocol — join the queue, then poll for result
      const joinResp = await fetch(`${VTON_SPACE}/queue/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fn_index: 0,
          session_hash: Math.random().toString(36).slice(2),
          data: [
            {
              background: { path: personPath, url: `${VTON_SPACE}/file=${personPath}`, orig_name: 'person.jpg', mime_type: baseImg.mimeType },
              layers: [],
              composite: null
            },
            { path: garmentPath, url: `${VTON_SPACE}/file=${garmentPath}`, orig_name: 'garment.jpg', mime_type: garmentImg.mimeType },
            'A clothing item',
            true,
            false,
            20,
            42
          ]
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (!joinResp.ok) {
        console.warn('[Try-On] IDM-VTON queue join failed:', joinResp.status);
      } else {
        const { event_id, queue_size } = await joinResp.json();
        console.log('[Try-On] Joined queue, event_id:', event_id, ' queue_size:', queue_size);

        // Poll the status stream 
        const statusResp = await fetch(`${VTON_SPACE}/queue/data?session_hash=${event_id}`, {
          signal: AbortSignal.timeout(90000)
        });

        if (statusResp.ok && statusResp.body) {
          const text = await statusResp.text();
          // Parse SSE output chunks to find the successful result
          const lines = text.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            try {
              const msg = JSON.parse(line.slice(5));
              if (msg.msg === 'process_completed' && msg.output?.data) {
                const imgRef = msg.output.data[0];
                let resultUrl = '';
                if (typeof imgRef === 'string' && imgRef.startsWith('http')) resultUrl = imgRef;
                else if (imgRef?.url) resultUrl = imgRef.url;
                else if (imgRef?.path) resultUrl = `${VTON_SPACE}/file=${imgRef.path}`;

                if (resultUrl) {
                  const imgFetch = await fetch(resultUrl, { signal: AbortSignal.timeout(20000) });
                  if (imgFetch.ok) {
                    const imgBuf = await imgFetch.arrayBuffer();
                    const imgB64 = Buffer.from(imgBuf).toString('base64');
                    const ct = imgFetch.headers.get('content-type') || 'image/png';
                    console.log('[Try-On] IDM-VTON success!');
                    return NextResponse.json({
                      result: `data:${ct};base64,${imgB64}`,
                      engine: 'IDM-VTON',
                      isFallback: false,
                      message: '✨ Your virtual try-on is ready!'
                    });
                  }
                }
                break;
              } else if (msg.msg === 'queue_full' || msg.msg === 'estimation') {
                console.log('[Try-On] IDM-VTON queue msg:', msg.msg);
              }
            } catch { /* skip non-JSON lines */ }
          }
        }
      }
    } catch (vtonErr) {
      console.warn('[Try-On] IDM-VTON error:', vtonErr);
    }

    // ───── ENGINE B: Gemini Direct Image Edit (keep real person, swap clothing visually) ─────
    if (geminiKey) {
      console.log('[Try-On] Attempting Gemini multi-image edit...');
      try {
        const editResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    text: `This is a virtual clothing try-on task.
Image 1: A person wearing their current outfit.
Image 2: A product photo of a specific garment to try on.

Task: Produce a photorealistic edited version of Image 1 where the person is wearing the EXACT garment from Image 2.

Critical requirements:
- The garment MUST match Image 2 exactly: same color shade (do not desaturate or change hue), same fabric texture, same collar style, same buttons, same logo/embroidery (size, position, design), same sleeve length, same fit.
- The person's face, hair, skin tone, build, body proportions, pose, expression, and background MUST remain 100% identical to Image 1.
- Only the clothing/shirt region changes. Nothing else.
- Result must look like a real photograph, not illustrated.`
                  },
                  { inlineData: { mimeType: baseImg.mimeType, data: baseImg.data } },
                  { inlineData: { mimeType: garmentImg.mimeType, data: garmentImg.data } }
                ]
              }],
              generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
            }),
            signal: AbortSignal.timeout(45000)
          }
        );

        if (editResp.ok) {
          const editData = await editResp.json();
          const imgPart = editData.candidates?.[0]?.content?.parts?.find(
            (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData
          );
          if (imgPart?.inlineData?.data) {
            return NextResponse.json({
              result: `data:${imgPart.inlineData.mimeType || 'image/png'};base64,${imgPart.inlineData.data}`,
              engine: 'Gemini Image Edit',
              isFallback: false,
              message: '✨ AI Try-On: Your photo with the garment edited in.'
            });
          }
          const textPart = editData.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text);
          console.warn('[Try-On] Gemini edit no image. Text reason:', textPart?.text?.slice(0, 100));
        }
      } catch (gemErr) {
        console.warn('[Try-On] Gemini edit error:', gemErr);
      }
    }

    // ───── ENGINE C: Gemini Stylist fallback (text analysis) ─────
    if (geminiKey) {
      try {
        const geminiResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: 'In 2 sentences, describe how this clothing item would look on this person. Be specific and positive.' },
                  { inlineData: { mimeType: baseImg.mimeType, data: baseImg.data } },
                  { inlineData: { mimeType: garmentImg.mimeType, data: garmentImg.data } }
                ]
              }]
            }),
            signal: AbortSignal.timeout(10000)
          }
        );
        if (geminiResp.ok) {
          const gemData = await geminiResp.json();
          const note = gemData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          return NextResponse.json({
            result: basePhotoData,
            engine: 'Gemini Stylist',
            isFallback: true,
            message: note ? `✨ AI Style Analysis: ${note}` : 'AI engines busy. Showing your photo.'
          });
        }
      } catch { /* silent */ }
    }

    return NextResponse.json({
      result: basePhotoData,
      engine: 'Preview Mode',
      isFallback: true,
      message: 'AI try-on engines are warming up. Try again in a moment.'
    });

  } catch (err: unknown) {
    console.error('[Try-On] Critical error:', err);
    return NextResponse.json({ error: 'Failed to process try-on' }, { status: 500 });
  }
}
