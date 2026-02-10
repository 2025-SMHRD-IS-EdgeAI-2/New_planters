const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../config/db'); // 기존 DB 연결 설정

// 1. 사진 저장 위치 및 파일명 설정
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9); // 현재시간 추출
        const ext = path.extname(file.originalname); // 확장자 추출 (.jpg, .png 등)
        cb(null, 'diary_' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage: storage });

// 2. 다이어리 작성 (사진 + 메모)
router.post('/upload', upload.single('diaryImage'), async (req, res) => {
    try {
        const { userEmail, emoji, comment } = req.body;
        const imgPath = req.file ? `/uploads/${req.file.filename}` : null;

        if (!imgPath) {
            return res.status(400).json({ ok: false, message: "사진이 없습니다!" });
        }

        // 2-1. plant_id 불러오기
        const plantid_sql = `
            SELECT p.plant_id 
                FROM user_info u
                    JOIN plant_info p 
                        ON u.user_id = p.user_id
                WHERE u.email = ?
            LIMIT 1
        `;;
        const [plantRows] = await db.query(plantid_sql, [userEmail]);

        if (plantRows.length === 0) {
            return res.status(404).json({ ok: false, message: "연결된 식물 정보를 찾을 수 없습니다." });
        }
        const plantId = plantRows[0].plant_id;
        // 2. 찾아낸 plantId와 함께 다이어리 정보 저장
        const insertSql = `
            INSERT INTO timeline 
                (plant_id, memo_text, emoji, img_path, created_at)
                    VALUES (?, ?, ?, ?, NOW())
        `;
        
        await db.query(insertSql, [plantId, comment, emoji, imgPath]);

        res.status(200).json({ ok: true, message: "다이어리 기록 완료!" });    
    } catch (err) {
        console.error("다이어리 업로드 실패:", err);
        res.status(500).json({ ok: false, message: "서버 오류 발생" });
    }
});

// 4. 다이어리 목록 가져오기 (타임라인용)
router.get('/list/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const sql = `
            SELECT t.* FROM timeline t
                JOIN plant_info p 
                    ON t.plant_id = p.plant_id
                JOIN user_info u 
                    ON p.user_id = u.user_id
                WHERE u.email = ?
            ORDER BY t.created_at DESC
            LIMIT 10
        `;
        const [rows] = await db.query(sql, [email]);
        res.status(200).json({ ok: true, data: rows });
    } catch (err) {
        res.status(500).json({ ok: false, message: "목록 불러오기 실패" });
    }
});

module.exports = router;