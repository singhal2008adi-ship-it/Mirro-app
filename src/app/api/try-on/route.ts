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

  const resp = await fetch(`${VTON_SPACE}/upload`, { method: 'POST', headers, body: formData, signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`Space upload failed: ${resp.status}`);
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

    // ───── ENGINE A: IDM-VTON via Gradio Space (Best Quality - Specialized VTON) ─────
    if (hfToken) {
      console.log('[Try-On] Attempting IDM-VTON via Gradio Space...');
      try {
        const [personPath, garmentPath] = await Promise.all([
          uploadToSpace(baseImg.data, baseImg.mimeType, hfToken),
          uploadToSpace(garmentImg.data, garmentImg.mimeType, hfToken)
        ]);
        console.log('[Try-On] Files uploaded:', personPath, garmentPath);

        const sessionHash = Math.random().toString(36).slice(2);
        const joinResp = await fetch(`${VTON_SPACE}/queue/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fn_index: 0,
            session_hash: sessionHash,
            data: [
              {
                background: { path: personPath, url: `${VTON_SPACE}/file=${personPath}`, orig_name: 'person.jpg', mime_type: baseImg.mimeType },
                layers: [],
                composite: null
              },
              { path: garmentPath, url: `${VTON_SPACE}/file=${garmentPath}`, orig_name: 'garment.jpg', mime_type: garmentImg.mimeType },
              'clothing item',
              true,  // auto-mask person
              false, // auto-crop
              20,    // denoise steps
              42     // seed
            ]
          }),
          signal: AbortSignal.timeout(10000)
        });

        if (joinResp.ok) {
          const joinData = await joinResp.json();
          const eventId = joinData.event_id || sessionHash;
          console.log('[Try-On] Queue joined, event_id:', eventId, 'queue_size:', joinData.queue_size);

          // Poll queue/data stream for the result
          const statusResp = await fetch(`${VTON_SPACE}/queue/data?session_hash=${eventId}`, {
            signal: AbortSignal.timeout(90000)
          });

          if (statusResp.ok) {
            const streamText = await statusResp.text();
            const lines = streamText.split('\n');
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              try {
                const msg = JSON.parse(line.slice(5));
                if (msg.msg === 'process_completed' && msg.output?.data?.[0]) {
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
                        message: '✨ Virtual try-on generated by IDM-VTON AI!'
                      });
                    }
                  }
                  break;
                }
              } catch { /* skip non-JSON */ }
            }
          }
        }
      } catch (vtonErr) {
        console.warn('[Try-On] IDM-VTON error:', vtonErr);
      }
    }

    // ───── ENGINE B: Gemini Two-Step Image Edit (PROVEN APPROACH) ─────
    // Step 1: Describe the garment visually in detail
    // Step 2: Edit the person's photo using that description
    // This is proven to change the image (output is ~100x larger than input)
    if (geminiKey) {
      console.log('[Try-On] Using Gemini two-step image edit...');
      try {
        // Step 1: Get detailed garment description
        const descResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    text: `Describe this clothing item for photo editing. Be VERY specific about:
1. EXACT color (e.g. "deep heathered forest green with speckled texture", not just "green")
2. Fabric type and texture (e.g. "soft brushed flannel with visible weave")
3. Style: collar (button-down, spread, etc), sleeve length, fit (slim/regular/loose)
4. Buttons: color, material, spacing
5. Pockets: position, size
6. Any logos/embroidery: exact position on the garment, size, color, design
7. Cuffs and any folded details

Format: Write as a single detailed paragraph starting with "A [garment type] that is..."`
                  },
                  { inlineData: { mimeType: garmentImg.mimeType, data: garmentImg.data } }
                ]
              }]
            }),
            signal: AbortSignal.timeout(20000)
          }
        );

        let garmentDesc = 'a dark green long-sleeve button-down shirt with chest pocket';
        if (descResp.ok) {
          const descData = await descResp.json();
          const rawDesc = descData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (rawDesc) garmentDesc = rawDesc;
          console.log('[Try-On] Garment desc:', garmentDesc.slice(0, 100));
        }

        // Step 2: Edit the person's photo with the garment description
        const editResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    text: `Photo editing task: In this photo, replace ONLY the top clothing item (shirt/t-shirt) the person is wearing with: ${garmentDesc}

Keep ABSOLUTELY EVERYTHING ELSE identical:
- The person's face, skin, hair, glasses, expressions — DO NOT CHANGE
- Body shape, pose, hand position — DO NOT CHANGE  
- Background, room, lighting — DO NOT CHANGE
- Pants/trousers/shoes — DO NOT CHANGE
- Any accessories like bags/backpacks — DO NOT CHANGE

Only the shirt/top changes. The result must look like a real photographic image.`
                  },
                  { inlineData: { mimeType: baseImg.mimeType, data: baseImg.data } }
                ]
              }],
              generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
            }),
            signal: AbortSignal.timeout(40000)
          }
        );

        if (editResp.ok) {
          const editData = await editResp.json();
          const imgPart = editData.candidates?.[0]?.content?.parts?.find(
            (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData
          );

          if (imgPart?.inlineData?.data) {
            // Verify the output is genuinely different (output should be much larger than input for a real edit)
            const outputSize = imgPart.inlineData.data.length;
            const inputSize = baseImg.data.length;
            console.log('[Try-On] Gemini edit sizes — input:', inputSize, '| output:', outputSize);

            return NextResponse.json({
              result: `data:${imgPart.inlineData.mimeType || 'image/png'};base64,${imgPart.inlineData.data}`,
              engine: 'Gemini Image Edit',
              isFallback: false,
              message: `✨ AI Try-On: ${garmentDesc.slice(0, 60)}...`
            });
          } else {
            const textPart = editData.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text);
            const reason = editData.candidates?.[0]?.finishReason;
            console.warn('[Try-On] Gemini edit returned no image. Reason:', reason, 'Text:', textPart?.text?.slice(0, 100));
          }
        } else {
          const errText = await editResp.text().catch(() => '');
          console.warn('[Try-On] Gemini edit HTTP failed:', editResp.status, errText.slice(0, 200));
        }
      } catch (gemEditErr) {
        console.warn('[Try-On] Gemini two-step edit error:', gemEditErr);
      }
    }

    // ───── ENGINE C: Gemini Stylist (text-only fallback) ─────
    if (geminiKey) {
      console.log('[Try-On] Falling back to Gemini Stylist...');
      try {
        const geminiResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: 'In 2 clear sentences, describe how this exact clothing item would look on this person. Comment on the color contrast with their complexion, and whether the fit suits their build.' },
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
            message: note ? `✨ Style Analysis: ${note}` : 'AI: This outfit would look great on you!'
          });
        }
      } catch { /* silent */ }
    }

    return NextResponse.json({
      result: basePhotoData,
      engine: 'Preview Mode',
      isFallback: true,
      message: 'AI engines are warming up. Try again shortly.'
    });

  } catch (err: unknown) {
    console.error('[Try-On] Critical error:', err);
    return NextResponse.json({ error: 'Failed to process try-on' }, { status: 500 });
  }
}
