// /api/ghl-webhook.js  (FINAL)

export default async function handler(req, res) {
  // Allow GET as a simple health check
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, msg: 'Use POST with JSON body.' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const intake = (req.body || {});
    const n = normalizeIntake(intake);

    // 1) Make the Brand Kit data (AI if key exists, else fallback)
    const data = await generateBrandKitData(n);

    // 2) Build HTML
    const html = buildBrandKitHTML(data);

    // 3) Optional email (only if SMTP envs exist)
    let emailInfo = null;
    const hasSMTP = process.env.SMTP_HOST && process.env.EMAIL_TO;
    if (hasSMTP) {
      const nodemailer = await import('nodemailer'); // dynamic import (works on Vercel)
      const port = Number(process.env.SMTP_PORT || 587);
      const transporter = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
      emailInfo = await transporter.sendMail({
        from: process.env.EMAIL_FROM || 'no-reply@brandkit.local',
        to: process.env.EMAIL_TO,
        subject: `Brand Kit - ${n.business_name || 'New Submission'}`,
        html,
      });
    }

    return res.status(200).json({ ok: true, html, result: data, emailed: !!emailInfo });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

/* ---------- helpers ---------- */
function v(x){ return (typeof x === 'string') ? x.trim() : (x || ''); }

function normalizeIntake(i = {}) {
  return {
    full_name: v(i.full_name),
    business_name: v(i.business_name || i.businessName),
    email: v(i.email),
    phone: v(i.phone),
    address: v(i.address),
    website_url: v(i.website_url),

    business_desc: v(i.business_desc),
    products_services: v(i.products_services),
    target_audience: v(i.target_audience),
    usp: v(i.usp),
    preferred_colors: v(i.preferred_colors),
    style_theme: v(i.style_theme),
    tagline: v(i.tagline),
    slogan: v(i.slogan),
    reviews: v(i.reviews),

    video1_desc: v(i.video1_desc),  video1_link: v(i.video1_link),
    video2_desc: v(i.video2_desc),  video2_link: v(i.video2_link),
    video3_desc: v(i.video3_desc),  video3_link: v(i.video3_link),

    link_fb: v(i.link_fb), link_ig: v(i.link_ig), link_tt: v(i.link_tt),
    link_li: v(i.link_li), link_yt: v(i.link_yt), link_gbp: v(i.link_gbp),
    other_social_url1: v(i.other_social_url1), other_social_url2: v(i.other_social_url2),

    seo_keywords: v(i.seo_keywords),
    seo_meta_desc: v(i.seo_meta_desc),
    contact_keywords: v(i.contact_keywords),
  };
}

async function generateBrandKitData(n){
  const key = process.env.OPENAI_API_KEY;
  if (!key) return mockResult(n);

  // Call OpenAI directly via fetch (no extra package needed)
  const prompt = buildPrompt(n);
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":"application/json",
      "Authorization":`Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.7,
      messages: [
        { role: "system", content: "You are an expert brand strategist and creative director." },
        { role: "user", content: prompt }
      ]
    })
  });

  const json = await resp.json();
  let content;
  try { content = JSON.parse(json?.choices?.[0]?.message?.content || '{}'); } catch { content = null; }
  if (!content || !Array.isArray(content.taglines) || content.taglines.length < 5) {
    return mockResult(n);
  }
  return content;
}

function buildPrompt(n){
  return `You are a senior brand strategist. Create a concise, sales-minded brand kit.

Return ONLY valid JSON with this shape:
{
  "taglines": [5 strings],
  "slogans": [5 strings],
  "palette": [{"name": string, "hex": string}],
  "business_card": {
    "sides": "one" | "two",
    "layout": "minimal" | "modern" | "classic" | "bold",
    "front": {"elements": [string], "fonts": [string], "colors": [string]},
    "back":  {"elements": [string], "fonts": [string], "colors": [string]}
  },
  "flyer": {
    "recommended_sizes": ["8.5x11 in", "5.5x8.5 in", "11x17 in"],
    "orientation": "portrait" | "landscape",
    "layout_notes": [string],
    "bleed_note": "Add 0.125 in bleed on all sides"
  },
  "smart_page": {
    "background_hex": string,
    "fonts": [string],
    "mobile_readability_notes": [string]
  },
  "seo": {
    "keywords": [string],
    "meta_title": string,
    "meta_description": string
  },
  "contact_keywords": [string],
  "videos": {
    "runway_30": {"script": string, "scene_prompts": [string]},
    "pika_30":   {"script": string, "scene_prompts": [string]},
    "capcut_30": {"script": string, "scene_prompts": [string]},
    "runway_60": {"script": string, "scene_prompts": [string]},
    "pika_60":   {"script": string, "scene_prompts": [string]},
    "capcut_60": {"script": string, "scene_prompts": [string]}
  }
}

Business: ${n.business_name}
What it does: ${n.business_desc}
USP: ${n.usp}
Products/Services: ${n.products_services}
Audience: ${n.target_audience}
Brand style: ${n.style_theme}
Preferred colors: ${n.preferred_colors}
Website: ${n.website_url}
Reviews: ${n.reviews}
SEO keywords: ${n.seo_keywords}

Rules:
- Taglines ≤ 8 words; Slogans ≤ 12 words; 5 of each.
- Include HEX color codes.
- Card: specify QR placement + side with CTA.
- Flyer: include 0.125in bleed note.
- Smart page: high contrast for mobile.
- SEO: include city names if present.
- Video: 4–6 scenes with strong CTA.`;
}

function mockResult(n){
  return {
    taglines: [
      "Stand Out. Get Chosen.",
      "Make Your Brand Unmissable.",
      "Built To Win Attention.",
      "From Idea To Impact.",
      "Look Sharp. Sell More."
    ],
    slogans: [
      "Custom merch that turns heads and drives sales.",
      "Your brand, beautifully designed for everyday wins.",
      "Premium looks, practical prices, real results.",
      "Designs that connect customers to your story.",
      "Fast, modern branding that means business."
    ],
    palette: [
      { name: "Navy Blue", hex: "#0A2A66" },
      { name: "Gold", hex: "#E4B343" },
      { name: "Soft White", hex: "#F7F8FA" }
    ],
    business_card: {
      sides: "two",
      layout: "modern",
      front: {
        elements: ["logo top-left", "name & role", "phone", "email"],
        fonts: ["Inter Semibold", "Inter Regular"],
        colors: ["#0A2A66", "#E4B343"]
      },
      back: {
        elements: ["big QR code center", "CTA: Scan for quote"],
        fonts: ["Inter Bold"],
        colors: ["#0A2A66", "#F7F8FA"]
      }
    },
    flyer: {
      recommended_sizes: ["8.5x11 in", "5.5x8.5 in", "11x17 in"],
      orientation: "portrait",
      layout_notes: [
        "Top: hero product or happy customer",
        "Middle: 3 key benefits with icons",
        "Bottom: bold CTA with QR and phone"
      ],
      bleed_note: "Add 0.125 in bleed on all sides"
    },
    smart_page: {
      background_hex: "#0A2A66",
      fonts: ["Inter", "DM Sans"],
      mobile_readability_notes: [
        "High contrast (#FFFFFF on #0A2A66)",
        "Buttons full-width with 44px min height"
      ]
    },
    seo: {
      keywords: (n.seo_keywords || "custom shirts Phoenix, embroidery AZ").split(',').map(s => s.trim()),
      meta_title: `${n.business_name || 'Your Business'} - Custom Merch & Printing`,
      meta_description: n.seo_meta_desc || "We create personalized apparel and promotional items to help your brand stand out."
    },
    contact_keywords: (n.contact_keywords || "custom shirts, embroidery, logo mugs").split(',').map(s => s.trim()),
    videos: {
      runway_30: { script: "VO: Your brand deserves more than clip art. We create custom merch that stands out and sells. CTA: Scan the QR for a fast quote.",
        scene_prompts: ["Close-up of custom shirts","Smiling customer receiving tote","Phone scanning QR code"] },
      pika_30: { script: "VO: Tired of bland branding? Upgrade your look with fast, modern merch. CTA: Tap to start now.",
        scene_prompts: ["Logo build motion","Embroidery machine in action","QR with CTA overlay"] },
      capcut_30: { script: "VO: Make your brand unmissable with quality designs and quick turnaround. CTA: Message us today.",
        scene_prompts: ["Merch lineup","Before/after refresh","Staff helping a customer"] },
      runway_60: { script: "Longer version with story arc and benefits.", scene_prompts: ["Scene 1","Scene 2","Scene 3","Scene 4"] },
      pika_60:   { script: "Longer version with story arc and benefits.", scene_prompts: ["Scene 1","Scene 2","Scene 3","Scene 4"] },
      capcut_60: { script: "Longer version with story arc and benefits.", scene_prompts: ["Scene 1","Scene 2","Scene 3","Scene 4"] }
    }
  };
}

function buildBrandKitHTML(result){
  const esc = (s)=>String(s||'').replace(/[&<>]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const list = (arr)=> (arr||[]).map(x=>`<li>${esc(x)}</li>`).join('');
  const colorSwatches = (arr=[]) => arr.map(c=>`
    <div style="display:inline-block;margin:6px 10px 6px 0;">
      <div style="width:32px;height:32px;border-radius:6px;border:1px solid #ddd;background:${esc(c.hex)}"></div>
      <div style="font-size:12px;color:#444;">${esc(c.name)}<br>${esc(c.hex)}</div>
    </div>`).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Brand Kit</title></head>
<body style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111;padding:24px;max-width:920px;margin:0 auto;">
  <h1 style="margin:0 0 8px 0;">Brand Kit</h1>
  <p style="margin-top:0;color:#555;">Generated ${new Date().toLocaleString()}</p>

  <h2>Taglines (5)</h2><ul>${list(result.taglines)}</ul>
  <h2>Slogans (5)</h2><ul>${list(result.slogans)}</ul>

  <h2>Color Palette</h2><div>${colorSwatches(result.palette)}</div>

  <h2>Business Card</h2>
  <p><strong>Sides:</strong> ${esc(result.business_card?.sides)} | <strong>Layout:</strong> ${esc(result.business_card?.layout)}</p>
  <h3>Front</h3><ul>${list(result.business_card?.front?.elements)}</ul>
  <p><strong>Fonts:</strong> ${(result.business_card?.front?.fonts || []).map(esc).join(', ')}</p>
  <p><strong>Colors:</strong> ${(result.business_card?.front?.colors || []).map(esc).join(', ')}</p>
  <h3>Back</h3><ul>${list(result.business_card?.back?.elements)}</ul>
  <p><strong>Fonts:</strong> ${(result.business_card?.back?.fonts || []).map(esc).join(', ')}</p>
  <p><strong>Colors:</strong> ${(result.business_card?.back?.colors || []).map(esc).join(', ')}</p>

  <h2>Flyer</h2>
  <p><strong>Recommended sizes:</strong> ${(result.flyer?.recommended_sizes || []).map(esc).join(', ')}</p>
  <p><strong>Orientation:</strong> ${esc(result.flyer?.orientation)}</p>
  <ul>${list(result.flyer?.layout_notes)}</ul>
  <p style="color:#900;"><strong>Print Note:</strong> ${esc(result.flyer?.bleed_note || 'Add 0.125 in bleed on all sides')}</p>

  <h2>Smart Page</h2>
  <p><strong>Background:</strong> ${esc(result.smart_page?.background_hex)} | <strong>Fonts:</strong> ${(result.smart_page?.fonts || []).map(esc).join(', ')}</p>
  <ul>${list(result.smart_page?.mobile_readability_notes)}</ul>

  <h2>SEO</h2>
  <p><strong>Meta Title:</strong> ${esc(result.seo?.meta_title)}</p>
  <p><strong>Meta Description:</strong> ${esc(result.seo?.meta_description)}</p>
  <p><strong>Keywords:</strong> ${(result.seo?.keywords || []).map(esc).join(', ')}</p>

  <h2>Contact Keywords</h2>
  <p>${(result.contact_keywords || []).map(esc).join(', ')}</p>

  <h2>Video Scripts</h2>
  ${['runway_30','pika_30','capcut_30','runway_60','pika_60','capcut_60'].map(k => `
    <h3 style="margin-top:18px;">${k.replace('_',' ').toUpperCase()}</h3>
    <p><strong>Script:</strong> ${esc(result.videos?.[k]?.script)}</p>
    <ol>${(result.videos?.[k]?.scene_prompts || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
  `).join('')}

  <hr style="margin:28px 0;">
  <p style="color:#777;font-size:12px;">Tip: Use HEX codes and layout notes directly in Canva or your design tool. Ensure 0.125 in bleed for print.</p>
</body></html>`;
}
