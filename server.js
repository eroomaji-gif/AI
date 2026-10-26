// =====================================================================
// 🖥️ เซิร์ฟเวอร์ Render: รับรูป -> ถาม AI -> คำนวณแต้ม -> บันทึกลง Supabase
// =====================================================================

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------
// 🔑 ค่าตั้งต่าง ๆ (ใส่ใน Render > Environment ห้ามเขียนคีย์ลงในโค้ด)
// ---------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;                 // เช่น https://xxxx.supabase.co
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key (ห้ามเอาไปใส่ในหน้าเว็บ)
const AI_API_KEY = process.env.AI_API_KEY;                     // คีย์ API ของ AI
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';  // ชื่อโมเดล AI ที่ใช้อ่านรูป
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';      // โดเมนเว็บของคุณ (ตอนทดสอบใช้ * ได้)

// 📍 ตัวหารแต้ม: แต้มที่ AI อ่านได้ ÷ ตัวนี้ = แต้มที่ได้จริง (ตอนนี้หาร 2)
const DIVIDE_BY = Number(process.env.DIVIDE_BY || 2);

// 📍 เพดานแต้มต่อ 1 รูป กัน AI อ่านผิดแล้วได้แต้มมหาศาล
const MAX_POINTS_PER_IMAGE = Number(process.env.MAX_POINTS_PER_IMAGE || 100000);

// 📍 อายุแต้มรายสัปดาห์ = 7 วัน
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// 📍 ถามอะไร AI (แก้ข้อความนี้ให้ตรงกับหน้าจอที่ผู้ใช้ส่งมา เช่น บอกว่าแต้มอยู่มุมไหน)
const AI_PROMPT =
  'ในภาพนี้มีแต้มหรือคะแนนอยู่เท่าไหร่ ' +
  'เช็คว่าถูกตัดต่อจากเอไอหรือไม่อย่างเข้มงวด ' +
  'ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น รูปแบบ {"points": ตัวเลข} ' +
  'ถ้าไม่พบแต้มในภาพให้ตอบ {"points": 0}';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !AI_API_KEY) {
    console.error('❌ ตั้งค่า Environment ไม่ครบ (SUPABASE_URL, SUPABASE_SERVICE_KEY, AI_API_KEY)');
}

// ใช้ service_role เพื่อเขียนแต้มได้ (ผู้ใช้ทั่วไปแก้แต้มตัวเองไม่ได้แล้ว)
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: '6mb' })); // รับรูปแบบ base64 ได้ไม่เกินประมาณ 4MB

// ---------------------------------------------------------------------
// 🛡️ ตรวจว่าใครเรียกมา (อ่านจาก token ล็อกอินของ Supabase)
// ---------------------------------------------------------------------
async function getUserFromRequest(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return null;
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data || !data.user) return null;
    return data.user;
}

// กันกดส่งรัว: 1 คนส่งได้ทุก 10 วินาที
const lastSubmitAt = new Map();

// ---------------------------------------------------------------------
// ⏳ ตรวจวันหมดอายุของแต้มรายสัปดาห์
// ถ้ามีแต้มอยู่ และเริ่มนับมาครบ 7 วันแล้ว -> ลบเหลือ 0
// ---------------------------------------------------------------------
async function getFreshProfile(userId) {
    const cols = 'id, week_points, total_points, week_started_at';

    const { data: p, error } = await admin.from('profiles').select(cols).eq('id', userId).maybeSingle();
    if (error) throw error;
    if (!p) throw new Error('ไม่พบโปรไฟล์ผู้ใช้');

    const startedMs = new Date(p.week_started_at).getTime();
    const expired = p.week_points > 0 && (Date.now() - startedMs) >= WEEK_MS;

    if (expired) {
        const { data: u, error: e2 } = await admin
            .from('profiles')
            .update({ week_points: 0, week_started_at: new Date().toISOString() })
            .eq('id', userId)
            .select(cols)
            .single();
        if (e2) throw e2;
        return u;
    }
    return p;
}

// แปลงข้อมูลโปรไฟล์เป็นข้อมูลที่ส่งกลับหน้าเว็บ
function toStats(p) {
    const expiresAt = p.week_points > 0
        ? new Date(new Date(p.week_started_at).getTime() + WEEK_MS).toISOString()
        : null;
    return {
        week_points: p.week_points,
        total_points: p.total_points,
        week_expires_at: expiresAt
    };
}

// ---------------------------------------------------------------------
// 🤖 ส่งรูปให้ AI อ่านแต้ม (ตรงนี้คือจุดที่ยิง API ของ AI)
// ---------------------------------------------------------------------
async function askAiForPoints(base64, mime) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': AI_API_KEY,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: AI_MODEL,
            max_tokens: 100,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
                    { type: 'text', text: AI_PROMPT }
                ]
            }]
        })
    });

    if (!res.ok) {
        const t = await res.text();
        console.error('AI error:', res.status, t);
        throw new Error('เรียก AI ไม่สำเร็จ');
    }

    const json = await res.json();
    const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

    // ดึง JSON {"points": ตัวเลข} ออกจากคำตอบ
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI ตอบกลับในรูปแบบที่อ่านไม่ได้');

    const parsed = JSON.parse(match[0]);
    const points = Math.floor(Number(parsed.points));
    if (!Number.isFinite(points) || points < 0) return 0;
    return points;
}

// ---------------------------------------------------------------------
// 🌐 เส้นทาง API
// ---------------------------------------------------------------------

// เช็กว่าเซิร์ฟเวอร์ตื่นอยู่ไหม (Render ฟรีจะหลับถ้าไม่มีคนเรียก)
app.get('/', (req, res) => res.send('KTOWIN points server OK'));

// ดูแต้มของตัวเอง
app.get('/api/my-points', async (req, res) => {
    try {
        const user = await getUserFromRequest(req);
        if (!user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบใหม่' });

        const p = await getFreshProfile(user.id);
        res.json(toStats(p));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาด' });
    }
});

// ส่งรูปเพื่อรับแต้ม
app.post('/api/submit-points', async (req, res) => {
    try {
        const user = await getUserFromRequest(req);
        if (!user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบใหม่' });

        // กันกดรัว
        const last = lastSubmitAt.get(user.id) || 0;
        if (Date.now() - last < 10000) {
            return res.status(429).json({ error: 'ส่งเร็วเกินไป กรุณารอ 10 วินาที' });
        }
        lastSubmitAt.set(user.id, Date.now());

        // ตรวจรูปที่ส่งมา
        const { image, mime } = req.body || {};
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!image || !allowed.includes(mime)) {
            return res.status(400).json({ error: 'รูปภาพไม่ถูกต้อง (รองรับ jpg, png, webp)' });
        }

        // 🔍 กันส่งรูปซ้ำ: เอารูปมาทำลายนิ้วมือ (hash) แล้วเช็กว่าเคยส่งหรือยัง
        const hash = crypto.createHash('sha256').update(image).digest('hex');
        const dup = await admin.from('point_submissions').select('id').eq('image_hash', hash).maybeSingle();
        if (dup.data) {
            return res.status(409).json({ error: 'รูปนี้เคยถูกส่งไปแล้ว' });
        }

        // 🤖 ถาม AI ว่าในรูปมีกี่แต้ม
        const aiPoints = await askAiForPoints(image, mime);

        // ➗ คำนวณแต้มที่ได้จริง (แต้มจาก AI ÷ ตัวหาร) แล้วจำกัดเพดาน
        let added = Math.floor(aiPoints / DIVIDE_BY);
        if (added > MAX_POINTS_PER_IMAGE) added = MAX_POINTS_PER_IMAGE;

        if (added <= 0) {
            return res.status(422).json({ error: 'ไม่พบแต้มในรูปนี้ ลองส่งรูปที่ชัดขึ้น' });
        }

        // ตรวจวันหมดอายุก่อนบวกแต้มใหม่
        const p = await getFreshProfile(user.id);

        // 📍 ถ้าแต้มสัปดาห์เป็น 0 อยู่ = เริ่มนับรอบ 7 วันใหม่จากตอนนี้
        const weekStart = p.week_points === 0 ? new Date().toISOString() : p.week_started_at;

        // บันทึกว่ารูปนี้ใช้แล้ว (ถ้ามีคนส่งซ้ำพร้อมกัน ตัว unique จะกันไว้)
        const ins = await admin.from('point_submissions').insert({
            user_id: user.id,
            image_hash: hash,
            ai_points: aiPoints,
            added_points: added
        });
        if (ins.error) {
            if (ins.error.code === '23505') {
                return res.status(409).json({ error: 'รูปนี้เคยถูกส่งไปแล้ว' });
            }
            throw ins.error;
        }

        // 💰 บวกแต้ม: แต้มสัปดาห์ + แต้มสะสมถาวร พร้อมกัน
        const { data: updated, error: upErr } = await admin
            .from('profiles')
            .update({
                week_points: p.week_points + added,
                total_points: p.total_points + added,
                week_started_at: weekStart
            })
            .eq('id', user.id)
            .select('id, week_points, total_points, week_started_at')
            .single();
        if (upErr) throw upErr;

        // บันทึกลงประวัติการใช้งาน
        await admin.from('activity_logs').insert({
            user_id: user.id,
            action: 'ส่งรูปรับแต้ม +' + added
        });

        res.json({ added: added, ai_points: aiPoints, ...toStats(updated) });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาด' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
