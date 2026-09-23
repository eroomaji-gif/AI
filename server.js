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





app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "ข้อมูลข้อความไม่ถูกต้อง" });
        }

        const apiMessages = [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            ...messages
        ];

        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'openai/gpt-4o-mini',
            messages: apiMessages,
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

