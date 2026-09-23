const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();


app.use(cors());
app.use(express.json());


const SYSTEM_INSTRUCTION = `
คุณคือ AI ผู้ช่วยอัจฉริยะส่วนตัวที่มีความยืดหยุ่นสูง พร้อมปรับรูปแบบการพูดและคาแรคเตอร์ให้เข้ากับผู้ใช้และสถานการณ์ในบทสนทนานั้นๆ ทันที
- ด้านการพูดและการตอบสนอง: ให้สังเกตโทนเสียง สไตล์ และความต้องการของผู้ใช้ในประวัติการคุย แล้วปรับตัวให้สอดคล้อง เป็นกันเอง และตรงประเด็น
- คู่มือจับคู่ประเภทงานและภาษาโปรแกรมมิ่ง (ให้เลือกใช้ตามบริบทที่ผู้ใช้ถามเข้ามา):
  1. งานพัฒนาเกม หรือสคริปต์สำหรับ Game Engine:
     - ระบบเกมที่ใช้ Luau / Lua scripting -> ใช้ภาษา "Lua" หรือ "Luau"
     - ระบบเกมทั่วไป / Mobile Games -> ใช้ภาษา "C#", "C++" หรือ Java/Kotlin
  2. งานพัฒนาเว็บแอปพลิเคชัน (Web Development):
     - ส่วนหน้าจอ (Frontend) -> ใช้ "HTML, CSS, และ JavaScript / TypeScript"
     - ส่วนหลังบ้านและเซิร์ฟเวอร์ (Backend) -> ใช้ "Node.js, Python, PHP, หรือ Go"
  3. งานฐานข้อมูล ระบบอัตโนมัติ หรือสคริปต์ทั่วไป -> ใช้ภาษา "Python, SQL, หรือ JavaScript"
- หน้าที่หลัก: ช่วยเขียนโค้ด แก้ไขปัญหา และให้คำแนะนำทางเทคนิคอย่างเต็มที่โดยไม่มีกั๊ก ตามสิ่งที่ผู้ใช้ต้องการในขณะนั้น

- เงื่อนไขพิเศษ (Easter Egg / Future Mode):
  - หากตรวจพบคำว่า "KTO" (ตัวพิมพ์ใหญ่ทั้งหมด 3 ตัวอักษรติดกัน) ในข้อความของผู้ใช้ ให้เปิด "โหมดพิเศษ" โดยเปลี่ยนท่าที คำพูด หรือเตรียมพร้อมรับคำสั่งลับสำหรับฟีเจอร์ใหม่ในอนาคตทันทีตามที่ระบบกำหนด
`;




// จำนวนข้อความล่าสุดสูงสุดที่จะส่งไปให้ AI (กันไม่ให้ context ยาวเกินไปจนแพงหรือ error)
// นับรวมทั้งฝั่ง user และ AI (เช่น 30 = ประมาณ 15 รอบสนทนาล่าสุด)
const MAX_HISTORY_MESSAGES = 30;

// คำที่บ่งบอกว่าผู้ใช้อยากได้ "รูป" ไม่ใช่แค่ข้อความ (ปรับ/เพิ่มคำได้ตามต้องการ)
const IMAGE_INTENT_REGEX = /(วาดรูป|วาดภาพ|สร้างรูป|สร้างภาพ|เจนรูป|เจนภาพ|ขอรูป|ขอภาพ|generate\s*(an?\s*)?image|draw\s*(a|an|me)?\s*(picture|image)|create\s*(an?\s*)?image)/i;

function isImageRequest(text) {
    return IMAGE_INTENT_REGEX.test(text);
}

app.post('/api/chat', async (req, res) => {
    try {
        const userMessage = req.body.message;
        // history: array ของ { sender: "user" | "ai", message: "..." } ที่ส่งมาจากแอป
        // (ตรงกับ data model ที่ออกแบบไว้ใน Chatbot AI app: sender, message, timestamp)
        const incomingHistory = Array.isArray(req.body.history) ? req.body.history : [];

        if (!userMessage) {
            return res.status(400).json({ error: "ส่งข้อความมาด้วยสิครับ บ้านนี้ยังเหนื่อยอยู่อรј?" });
        }

        // แปลง history จากฝั่งแอป ให้เป็นฟอร์แมตที่ OpenRouter/OpenAI ต้องการ (role: user/assistant)
        const historyMessages = incomingHistory
            .slice(-MAX_HISTORY_MESSAGES) // ตัดเอาแค่ข้อความล่าสุด กันประวัติยาวเกิน
            .map(item => ({
                role: item.sender === 'ai' ? 'assistant' : 'user',
                content: item.message
            }));

        // ----- ถ้าเข้าข่าย "ขอให้วาดรูป" ให้สลับไปใช้โมเดลเจนรูป แล้วตอบกลับพร้อมรูปเลย -----
        if (isImageRequest(userMessage)) {
            const imageResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: 'google/gemini-2.5-flash-image-preview',
                messages: [
                    ...historyMessages,      // ส่งประวัติไปด้วย เผื่อเป็นการขอแก้ไขรูปที่คุยกันก่อนหน้า
                    { role: "user", content: userMessage }
                ],
                modalities: ["image", "text"]
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const imgMessage = imageResponse.data.choices[0].message;
            const images = (imgMessage.images || []).map(img => img.image_url.url);

            return res.json({
                reply: imgMessage.content || "นี่ครับ รูปที่วาดให้ 🎨",
                images // array ของ base64 data URL, ว่างได้ถ้าโมเดลไม่ส่งรูปมา
            });
        }

        // ----- ไม่งั้นก็คุยแชทปกติ -----
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'openai/gpt-4o-mini', // หรือโมเดลที่คุณใช้งานอยู่
            messages: [
                { role: "system", content: SYSTEM_INSTRUCTION },
                ...historyMessages,          // <-- ประวัติแชทเก่า ทำให้ AI จำบทสนทนาได้
                { role: "user", content: userMessage }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const aiReply = response.data.choices[0].message.content;
        res.json({ reply: aiReply });

    } catch (error) {
        console.error(error?.response?.data || error);
        res.status(500).json({ error: "ระบบหลังบ้านรวนนิดหน่อย ลองใหม่อีกทีซิ" });
    }
});





        

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

