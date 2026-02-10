const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../config/db");

// 웹에서 요청이 들어오면 저장된 경로를 찾아서.. 쏜다!
// 이미지 목록 가져오기
router.get("/:email", async (req, res) => {
    // req.params : ? 앞까지의 주소 부분
    // req.query : ? 뒤의 내용 (객체)
    const { email } = req.params;
    // ?start=2026-02-01&end=2026-02-06 형태
    // 사용자가 달력에 input한 값
    const { start, end } = req.query; 

    try {
        // 1. 이메일로 PLANT_ID를 먼저 찾거나, JOIN으로 한방에 해결!
        //    JOIN을 써서 해당 유저의 식물 이미지만 가져올 거야.
        const sql = `
            SELECT 
                i.IMG_PATH,
                i.CREATED_AT
            FROM IMG_DATA i
                JOIN PLANT_INFO p 
                    ON i.PLANT_ID = p.PLANT_ID
                JOIN USER_INFO u 
                    ON p.USER_ID = u.USER_ID
            WHERE u.EMAIL = ? 
              AND i.CREATED_AT BETWEEN ? AND ?
            ORDER BY i.CREATED_AT ASC
        `;

        // 시작일은 00:00:00부터, 종료일은 23:59:59까지로 범위
        const [rows] = await db.execute(sql, [
            email, 
            `${start} 00:00:00`, 
            `${end} 23:59:59`
        ]);

        if (rows.length > 0) {
            res.json({ success: true, images: rows });
        } else {
            res.json({ success: false, message: "해당 기간에 저장된 이미지가 없어!" });
        }
    } catch (error) {
        console.error("타임랩스 조회 에러:", error);
        res.status(500).json({ success: false, message: "서버 에러 발생" });
    }
});

module.exports = router;