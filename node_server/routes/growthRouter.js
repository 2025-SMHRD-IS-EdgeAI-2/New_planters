const express = require("express");
const router = express.Router();
const db = require("../config/db");

// 키 성장 데이터 가져오기
router.get('/history/:email', async (req, res) => {
    try {
        const { email } = req.params; // URL에서 :email 값을 가져옴

        // 이메일로부터 식물 성장 데이터를 가져오기
        // 잘못찍힌 사진들 많아 우선 데이터 값의 범위를 좁혀놓음
        // + 가져오는 날짜도 수정함
        const sql = `
            SELECT 
                p.PLANT_ID, 
                DATE_FORMAT(i.CREATED_AT, '%m-%d') as date, 
                i.HEIGHT_VAL as height
                    FROM IMG_DATA i
                        JOIN PLANT_INFO p 
                            ON i.PLANT_ID = p.PLANT_ID
                        JOIN USER_INFO u 
                            ON p.USER_ID = u.USER_ID
                    WHERE u.EMAIL = ?
                        AND i.HEIGHT_VAL > 0  
                        ORDER BY i.CREATED_AT ASC
                        `;
                        // AND i.HEIGHT_VAL < 30
                        // AND i.CREATED_AT >= '2026-02-09 19:30:00'
                        
        const [rows] = await db.query(sql, [email]);

        if (rows.length === 0) {
            return res.json({ 
                success: true, 
                message: "해당 사용자의 식물 성장 데이터가 없습니다.", 
                growthRate: 0,
                history: [] 
            });
        }

        // 성장률 계산 (첫 측정 대비 최근 측정)
        const firstHeight = rows[0].height;
        const lastHeight = rows[rows.length - 1].height;
        let growthRate = 0;
        if (firstHeight > 0) {
            growthRate = ((lastHeight - firstHeight) / firstHeight * 100).toFixed(1);
        }

        res.json({
            success: true,
            growthRate: growthRate, // 사진의 +12% 부분
            history: rows          // 사진의 변화 그래프 부분

        });

    } catch (err) {
        console.error("데이터 조회 실패:", err.message);
        res.status(500).json({ success: false, message: "서버 내부 에러" });
    }
});

module.exports = router ;