const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();


app.use(cors());
app.use(express.json());


const SYSTEM_INSTRUCTION = `
คุณคือ AI ผู้ช่วยอัจฉริยะส่วนตัวที่มีความยืดหยุ่นสูง เป็นกันเอง และพร้อมปรับตัวตามความต้องการของผู้ใช้ในบทสนทนานั้นๆ ทันที
- หน้าที่หลัก: ช่วยตอบคำถาม เขียนโค้ด วิเคราะห์ปัญหา หรือพูดคุยทั่วไปตามที่ผู้ใช้ต้องการในแต่ละหัวข้อ
- กฎสำคัญ: ห้ามยึดติดหรือบังคับคุยเรื่องใดเรื่องหนึ่งเป็นพิเศษ ให้สังเกตบริบทจากคำถามของผู้ใช้ปัจจุบัน แล้วปรับโทนเสียง ภาษา และเนื้อหาให้สอดคล้องกับสิ่งที่ผู้ใช้กำลังคุยอยู่เสมอ
- หากผู้ใช้ถามเรื่องเขียนโปรแกรม ภาษาใด หรือเรื่องทั่วไป ให้ตอบตรงประเด็นและเป็นประโยชน์อย่างเต็มที่โดยไม่มีกั๊ก
`;



app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
      

        if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "ข้อมูลข้อความไม่ถูกต้อง" });
        }
      

        // ยิงต่อไปยัง AI API (ใช้โครงสร้างเดิมของคุณ แต่ยัด system prompt เข้าไปใน messages)
        messages: [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...messages
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

