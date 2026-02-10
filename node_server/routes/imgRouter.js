const express = require('express');
const router = express.Router();    // 라우터 생성 위한 도구
const multer = require('multer');   // 파일 저장을 위한 도구
const db = require("../config/db"); // DB 모듈 불러오기
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

/* --------------------------------------------------
    multer 
    : 파일 정보를 req.file이라는 주머니에 넣어서 
      다음 순서인 (req, res) => { ... } 함수로 넘겨줌
----------------------------------------------------- */

// (1) 저장 방식 설정
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'raspi_img/') // 저장할 폴더
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname) // 원래 이름(originalname)을 그대로 사용
    }
});
// (2) 설정한 storage를 적용해서 upload 객체 생성 (폴더, 이름명)
const upload = multer({ storage: storage });

// 이미지 파일 받는 라우터
router.post('/photos', upload.single('image'), async (req, res) => {
    console.log("----------------------------");
    console.log("📸 IoT 이미지 도착! 처리 시작...");

    if (!req.file) {
        return res.status(400).json({ success: false, message: "파일이 없습니다." });
    }

    try {
        // ✅ 최신 plant_id 가져오기 (FK 안전)
        const [rows] = await db.query(`
            SELECT PLANT_ID
                FROM plant_info
                    ORDER BY PLANT_ID DESC
            LIMIT 1
            `);

        if (!rows.length) {
            return res.status(400).json({
                success: false,
                message: "plant_info에 식물이 없습니다. 먼저 식물 등록을 해주세요."
            });
        }
        const PLANT_ID = rows[0].PLANT_ID;
        // 파일 절대 경로
        const absolutePath = path.resolve(req.file.path);
        // Python 분석 요청
        const pythonUrl = 'http://192.168.219.197:8000/image/analyze';
        console.log(`📡 Python 분석 요청 중... (${pythonUrl})`);
        const pythonRes = await axios.post(pythonUrl, { file_path: absolutePath });
        console.log(pythonRes.data.success);
        const analyzedHeight = pythonRes.data.height;

        // ✅ Main.py 응답 기준으로 성공 판정
        if (pythonRes.data.success === true || pythonRes.data.success === "true") {
            console.log(`✅ 분석 성공! 키: ${analyzedHeight}cm`);

            const insertSql = `
                INSERT INTO IMG_DATA 
                    (PLANT_ID, IMG_PATH, HEIGHT_VAL, CREATED_AT)
                        VALUES (?, ?, ?, NOW())
                `;
            await db.query(insertSql, [PLANT_ID, req.file.path, analyzedHeight]);
            console.log("💾 이미지 데이터 DB 저장 완료!");
            return res.status(200).json({
                success: true,
                message: "성공",
                height: analyzedHeight
            });
        } else {
            throw new Error("Python 분석 실패");
        }
    } catch (err) {
        console.error("❌ 이미지 처리 중 에러:", err.message);
        return res.status(500).json({ success: false, message: "처리 실패" });
    }
});

module.exports = router;
