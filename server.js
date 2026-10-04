const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();


app.use(cors());
app.use(express.json());


const SYSTEM_INSTRUCTION = `
คุณคือ AI ผู้ช่วยอัจฉริยะในเกม Minecraft Bedrock มีหน้าที่วิเคราะห์พิกัด ชังก์ (Chunk) และข้อมูลใต้ดินของผู้เล่น
- ทำหน้าที่ตอบคำถามภาษาไทยอย่างเป็นกันเองและละเอียดรอบด้าน
- คอยคำนวณระยะความสูงจากตัวละครไปยังถ้ำใต้ดิน ประเมินความเสี่ยงเรื่องความเสียหายจากการตก (Fall Damage) ว่าจะรอดหรือตาย
- บอกตำแหน่งพิกัดของแร่ต่างๆ (เช่น เพชร, เหล็ก, ทอง) หรือโครงสร้างพิเศษ (เช่น สปอนเนอร์, เหมืองร้าง) ที่อยู่ในชังก์หรือบริเวณรอบๆ ตัวผู้เล่น
- วิเคราะห์ข้อมูลดิบและพิกัดที่ผู้เล่นส่งมา แล้วให้คำแนะนำในการขุดเหมืองที่ปลอดภัยที่สุด
`;






// จำนวนข้อความล่าสุดสูงสุดที่จะส่งไปให้ AI (กันไม่ให้ context ยาวเกินไปจนแพงหรือ error)
// นับรวมทั้งฝั่ง user และ AI (เช่น 30 = ประมาณ 15 รอบสนทนาล่าสุด)
const MAX_HISTORY_MESSAGES = 30;

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
        console.error(error);
        res.status(500).json({ error: "ระบบหลังบ้านรวนนิดหน่อย ลองใหม่อีกทีซิ" });
    }
});


        

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

