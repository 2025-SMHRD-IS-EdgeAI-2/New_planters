const express = require("express");
const router = express.Router();
const db = require("../config/db");
const axios = require('axios');     // 파이썬과의 통신을 위함

// DB로 부터 데이터 불러오기 -> 파이썬 전송
router.get('/', async (req, res) => {
    try {
        // console.log("=== [통계] 요청 들어옴! ===");
        // 1. 사용자 이메일 정보 가져오기
        const userEmail = req.query.email; 
        // console.log("요청받은 이메일:", userEmail);

        if (!userEmail) {
            console.log("❌ 이메일 정보가 없음");
            return res.status(400).json({ success: false, message: "이메일이 없습니다." });
        }

        // 2. 사용자 식물 정보+시간별 데이터 가져오기
        const [hourlyData] = await db.query(`
            SELECT h.* FROM EVENT_LOG_HOURLY h
                JOIN PLANT_INFO p 
                    ON h.PLANT_ID = p.PLANT_ID
                JOIN USER_INFO u 
                    ON p.USER_ID = u.USER_ID
                WHERE u.EMAIL = ? 
                    AND h.CREATED_AT >= DATE_SUB(NOW(), INTERVAL 24 HOUR) 
            ORDER BY h.CREATED_AT ASC
        `, [userEmail]);

        // 3. 이벤트 로그 가져오기
        const [eventData] = await db.query(`
            SELECT e.* 
                FROM EVENT_LOG e
                    JOIN PLANT_INFO p 
                        ON e.PLANT_ID = p.PLANT_ID
                    JOIN USER_INFO u    
                        ON p.USER_ID = u.USER_ID
                WHERE u.EMAIL = ?
            ORDER BY e.EVENT_DATE ASC
        `, [userEmail]);

        // console.log("=== DB 조회 결과 ===");
        // console.log("시간별 데이터 개수:", hourlyData.length);
        // console.log("이벤트 데이터 개수:", eventData.length);

        // [체크] 데이터가 둘 다 0개면 파이썬 서버에 보낼 필요 없이 바로 리턴
        if (hourlyData.length === 0 && eventData.length === 0) {
            return res.json({ success: false, message: "조회된 데이터가 없습니다." });
        }

        // 4. FastAPI(파이썬) 분석 서버로 데이터 전송
        const pythonResponse = await axios.post('http://192.168.219.197:8000/statistics/stats', {
            hourly: hourlyData,
            events: eventData
        });

        // 5. 파이썬이 분석해서 돌려준 데이터를 웹에 전달
        res.json({
            success : true,
            data : pythonResponse.data
        });

    } catch (error) {
        console.error("통계 데이터 처리 실패:", error.message);
        res.status(500).json({ error: "통계 분석 중 오류 발생" });
    }
});

module.exports = router;