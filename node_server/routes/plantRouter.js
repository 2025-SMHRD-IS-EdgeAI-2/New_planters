const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require("../config/db.js");



/* ====================
    재선이형 작업
======================= */
const plantController = require('../controllers/plantController');

console.log("---------------------------------------------------");
console.log("Controller 내용 확인:", plantController);
console.log("---------------------------------------------------");

// 파일 저장 설정 (uploads 폴더에 저장)
const upload = multer({ dest: 'uploads/' });

// POST /api/plants/analyze 로 요청이 오면 실행
router.post('/analyze', upload.single('file'), plantController.uploadAndAnalyze);


/* ====================
    현우 작업
======================= */

// 등록 식물 확인 라우터
router.get('/:userId', async (req, res) => {
    // email이 넘어올거임!
    const { userId } = req.params;
    try {
        const sql = `
            SELECT p.PLANT_NAME, p.PLANT_DATE,d.SPECIES_NAME 
                FROM PLANT_INFO p
                    JOIN USER_INFO u 
                        ON p.USER_ID = u.USER_ID
                    JOIN PLANT_DICT d 
                        ON p.SPECIES_ID = d.SPECIES_ID
                WHERE u.EMAIL = ?
            ORDER BY p.CREATED_AT DESC LIMIT 1        
            `;        
        const [rows] = await db.execute(sql, [userId]); 

        if (rows.length > 0) {
            res.json({
                success: true,
                hasPlant: true,
                plantName: rows[0].PLANT_NAME,
                plantDate: rows[0].PLANT_DATE,
                species: rows[0].SPECIES_NAME
            });
        } else {
            res.json({ success: true, hasPlant: false });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "식물 체크 실패" });
    }
});

// 등록 라우터
router.post('/register', async (req, res) => {
    console.log("================================");
    console.log("📢 서버: 등록 요청이 문 앞까지 왔어!");
    console.log("📦 몸통(body) 데이터:", req.body);
    console.log("================================");
    
    // ... 기존 try-catch 로직 ...
    try {
        const { plantName, plantSpecies, plantDate, email } = req.body; 
        // type에 "식물명"이 들어옴 userId에 "email"들어옴
        // 1. 이메일로 USERID 찾기
        const [userRows] = await db.execute("SELECT USER_ID FROM USER_INFO WHERE EMAIL = ?", [email]);
   
        if (userRows.length === 0) {
            return res.json({ 
                success: false, 
                message: "가입되지 않은 이메일 주소" 
            });
        }
        const userId = userRows[0].USER_ID;

        // 2. 식물 종 ID 조회        
        const [dictRows] = await db.execute("SELECT SPECIES_ID FROM PLANT_DICT WHERE SPECIES_NAME = ?", [plantSpecies]);        

        if (dictRows.length === 0) {
            return res.json({ 
                success: false, 
                 message: "도감에 등록되지 않은 식물 이름" 
            });
        }
        const speciesId = dictRows[0].SPECIES_ID;

        // 3. speciesId를 내 식물 정보(PLANT_INFO)에 저장
        // PLANT_NAME(식물이름), SPECIES_ID(식물번호), PLANT_DATE(입양일), USER_ID(사용자)
        const insertSql = "INSERT INTO PLANT_INFO (PLANT_NAME, SPECIES_ID, PLANT_DATE, USER_ID) VALUES (?, ?, ?, ?)";
        const params = [plantName, speciesId, plantDate, userId];

        const [result] = await db.execute(insertSql, params);

        if (result.affectedRows > 0) {
            res.json({ success: true, message: "반려식물 등록 완료" });
        }

    } catch (err) {
        console.error("등록 중 에러 발생:", err);
    }
});

// 반려식물 삭제 라우터 (plantRouter.js)
router.delete('/:email', async (req, res) => {
    const { email } = req.params;
    
    try {
        // 이메일로 USER_ID를 먼저 찾아서 그 유저의 식물을 삭제함
        const sql = `
            DELETE p FROM PLANT_INFO p
            JOIN USER_INFO u ON p.USER_ID = u.USER_ID
            WHERE u.EMAIL = ?
        `;
        
        const [result] = await db.execute(sql, [email]);

        if (result.affectedRows > 0) {
            res.json({ success: true, message: "식물 삭제 완료" });
        } else {
            res.json({ success: false, message: "삭제할 식물이 없어!" });
        }
    } catch (err) {
        console.error("삭제 중 에러:", err);
        res.status(500).json({ success: false, message: "서버 삭제 에러" });
    }
});

module.exports = router;

