const express = require('express');
const router = express.Router();    // 라우터 생성 위한 도구
const db = require("../config/db"); // DB 모듈 불러오기
const axios = require('axios');

/* --------------------------
  임계치 넘으면 EVENT_LOG 저장
----------------------------- */
function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 임계치 가져오는 함수
async function getPlantThresholds(db, plantId) {
    // plant_info -> species_id -> plant_dict(임계치) 조인
    const [rows] = await db.query(`
        SELECT pi.PLANT_ID, pi.SPECIES_ID, pd.*
            FROM plant_info pi
                JOIN plant_dict pd 
                    ON pi.SPECIES_ID = pd.SPECIES_ID
            WHERE pi.PLANT_ID = ?
        LIMIT 1
        `, [plantId]);
    return rows.length ? rows[0] : null;
    }
    // 같은 이벤트가 너무 자주 쌓이는 것 방지 (쿨다운)
    async function alreadyLoggedRecently(db, plantId, eventType, minutes = 10) {
    const [rows] = await db.query(`
        SELECT 1
            FROM EVENT_LOG
            WHERE PLANT_ID = ? AND EVENT_TYPE = ?
                AND EVENT_DATE > DATE_SUB(NOW(), INTERVAL ? MINUTE)
        LIMIT 1
    `, [plantId, eventType, minutes]);
    return rows.length > 0;
    }

// 이벤트 발생 시 이벤트 로그에 담는 함수
async function insertEventLog(db, payload) {
    const {
        plantId, eventType, sensorType,
        sensorValue, thMin, thMax,
        temp, hum, light, soil
    } = payload;
    await db.query(`
        INSERT INTO EVENT_LOG
            (PLANT_ID, EVENT_TYPE, SENSOR_TYPE,
            SENSOR_VALUE, THRESHOLD_MIN, THRESHOLD_MAX,
            TEMP, HUM, LIGHT, SOIL, EVENT_DATE)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            plantId, eventType, sensorType,
            sensorValue, thMin, thMax,
            temp, hum, light, soil
            ]
        );
    }

async function evaluateAndLogEvents(db, plantId, metrics, cooldownMinutes = 30) {
    const th = await getPlantThresholds(db, plantId);
    console.log(th);
    
    if (!th) return;
        // metrics는 hourly 평균값이 들어온다고 가정 (temp_avg 등)
        // plant_dict 컬럼명은 너희 DB에 맞게 수정 필요 (아래 TEMP_MIN/MAX 등)
        const rules = [
            { key: "temp_avg", sensor: "temp", minCol: "TEMP_MIN", maxCol: "TEMP_MAX" },
            { key: "hum_avg",  sensor: "hum",  minCol: "HUM_MIN",  maxCol: "HUM_MAX"  },
            { key: "lux_avg",  sensor: "lux",  minCol: "LUX_MIN",  maxCol: "LUX_MAX"},
            { key: "soil_avg", sensor: "soil", minCol: "SOIL_MIN", maxCol: "SOIL_MAX" },
        ];
        const snapshot = {
            temp: toNumberOrNull(metrics.temp_avg) ?? 0,
            hum: toNumberOrNull(metrics.hum_avg) ?? 0,
            light: toNumberOrNull(metrics.lux_avg) ?? 0,
            soil: toNumberOrNull(metrics.soil_avg) ?? 0,
        };
    for (const r of rules) {
        const value = toNumberOrNull(metrics[r.key]);
        if (value === null) continue;
        const thMin = toNumberOrNull(th[r.minCol]);
        const thMax = toNumberOrNull(th[r.maxCol]);
        if (thMin === null && thMax === null) continue; // 임계치 자체가 없으면 스킵
        // LOW
        if (thMin !== null && value < thMin) {
            const eventType = `${r.sensor.toUpperCase()}_LOW`;
            if (!(await alreadyLoggedRecently(db, plantId, eventType, cooldownMinutes))) {
                await insertEventLog(db, {
                    plantId,
                    eventType,
                    sensorType: r.sensor,
                    sensorValue: value,
                    thMin,
                    thMax,
                    ...snapshot
                });
            }
        }
    // HIGH
        if (thMax !== null && value > thMax) {
            const eventType = `${r.sensor.toUpperCase()}_HIGH`;
            if (!(await alreadyLoggedRecently(db, plantId, eventType, cooldownMinutes))) {
                await insertEventLog(db, {
                    plantId,
                    eventType,
                    sensorType: r.sensor,
                    sensorValue: value,
                    thMin,
                    thMax,
                    ...snapshot
                });
            }
        }
    }
}


// 1. 센서 데이터 받는 라우터
router.post('/sensors', async (req, res) => {
    console.log("🌡️ 센서 데이터 도착!", req.body);
    try {
        // 1) FK 해결용: plant_id 확보 (지금처럼 최신값 쓰거나, 라파가 보내게 하거나)
        const [plantRows] = await db.query(`
            SELECT PLANT_ID
                FROM plant_info
                    ORDER BY PLANT_ID DESC
            LIMIT 1
        `);
        if (!plantRows.length) {
            return res.status(400).json({ success:false, message:"plant_info 비어있음" });
        }

        const PLANT_ID = plantRows[0].PLANT_ID;
        const { TEMP, HUM, LUX, WATER } = req.body;
        
        // python으로 보낼 payload
        const payload = {
            plant_id: PLANT_ID,
            temp: Number(TEMP),
            hum: Number(HUM),
            light: Number(LUX),
            soil: Number(WATER)
        };
        console.log("2. [Node] Python Ingest 호출 시작");
        // 데이터 수집
        await axios.post("http://192.168.219.236:8000/sensor/ingest", payload).catch(e => console.error("Ingest 실패:", e.message));
        // // ✅ 2) Python으로만 전달
        // const ingest = await axios.post("http://192.168.219.236:8000/sensor/ingest", payload);
        // const ingest_result = ingest.data ;
        // // console.log("✅ Ingest 결과:", ingest_result);

        // 데이터 분석
        console.log("3. [Node] Python Analyze 호출 시작");
        const analyzeRes = await axios.post("http://192.168.219.236:8000/sensor/analyze", payload);
        const result = analyzeRes.data || {};
        console.log("이벤트 발생 여부", result);
        let llmResult = null;
        // 3) LLM
        // Python FastAPI로 실시간 센서 분석 요청
        // 주의: URL은 네 환경에 맞춰서 하나로 통일해 (예: /sensor/analyze)
        // console.log("🧠 Python으로  LLM 분석 요청 중...");
        // const sensorRes = await fetch("http://192.168.219.236:8000/sensor/analyze", {
        //     method: "POST",
        //     headers: { "Content-Type": "application/json" },
        //     body: JSON.stringify(payload),
        // });
        // const result = await sensorRes.json() || {}; 
        // console.log("✅ 분석 결과:", result);

        // [STEP 3] 이벤트 발생 시 LLM 알림 호출
        
        if (result?.event_occurred === true) {
            console.log("➡️ 이벤트 감지! LLM 호출 중...");
            const llmRes = await axios.post("http://192.168.219.236:8000/llm/notification", {
                plant_id: PLANT_ID,
                event_type: result.event_type,
                sensor_value: result.sensor_value,
                threshold_min: result.threshold_min,
                threshold_max: result.threshold_max,
            });
            llmResult = llmRes.data;
        }
        // [STEP 4] 최종 응답
        console.log("4. [Node] 분석 완료:", analyzeRes.data);
        return res.status(200).json({
            success: true,
            message: result.event_occurred ? "이벤트 감지 및 알림 완료" : "정상 데이터 처리 완료",
            sensor_analysis: result,
            notification: llmResult
        });
    } catch (err) {
        console.error("❌ 센서 처리 실패:", err.message);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
});


// 2. 1시간 평균 데이터용 라우터 
router.post('/hourly', async (req, res) => {
    try {
        let {
            plant_id,
            start_at,
            end_at,
            temp_avg,
            hum_avg,
            lux_avg,
            soil_avg
        } = req.body;
        // console.log(req.body);
        const light_avg = lux_avg;

        // ✅ 1) plant_id가 plant_info에 존재하는지 확인
        const [exists] = await db.query(
            "SELECT 1 FROM plant_info WHERE PLANT_ID = ? LIMIT 1",
            [plant_id]
        );

        // ✅ 2) 없으면 최신 PLANT_ID로 교정
        if (!exists.length) {
            const [latest] = await db.query(`
                SELECT PLANT_ID
                    FROM plant_info
                        ORDER BY PLANT_ID DESC
                LIMIT 1
            `);

        if (!latest.length) {
            return res.status(400).json({
                success: false,
                message: "plant_info 비어있음 (식물 등록 먼저 필요)"
            });
        }

        console.log(
            `⚠️ hourly plant_id(${plant_id}) 없음 → ${latest[0].PLANT_ID}로 교정`
        );
        plant_id = latest[0].PLANT_ID;
        }

    // ✅ 3) 안전한 plant_id로 INSERT
        const sql = `
            INSERT INTO EVENT_LOG_HOURLY
                (PLANT_ID, START_AT, END_AT, TEMP_AVG, HUM_AVG, LIGHT_AVG, SOIL_AVG)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        await db.query(sql, [
            plant_id,
            start_at,
            end_at,
            temp_avg,
            hum_avg,
            lux_avg,
            soil_avg
        ]);
        console.log("🕒 평균 데이터 DB 저장 완료");

        // 이벤트 분석 1
        /* =================================
            soil 급락(물 준 이벤트) 분석
            센서 범위: 0 ~ 4095
        ================================= */
        
        // 최근 hourly soil_avg 2개 조회
        const [soilRows] = await db.query(`
            SELECT SOIL_AVG
                FROM EVENT_LOG_HOURLY
                    WHERE PLANT_ID = ?
            ORDER BY END_AT DESC
            LIMIT 2
        `, [plant_id]);
        
        if (soilRows.length === 2) {
            const currSoil = Number(soilRows[0].SOIL_AVG);
            const prevSoil = Number(soilRows[1].SOIL_AVG);
            const delta = currSoil - prevSoil; // 물 주면 큰 음수
        
            console.log("🌱 soil 비교", {
                prevSoil,
                currSoil,
                delta,
                percent: ((Math.abs(delta) / 4095) * 100).toFixed(1) + "%"
            });
        
            // ✅ 센서 범위(0~4095) 기준 급락 판단
            // 약 17% 이상 하락 시 물 준 이벤트로 판단
            const DROP_THRESHOLD = -500;
        
            if (delta <= DROP_THRESHOLD) {
                console.log("💧 물 준 이벤트 감지!");
        
                // 중복 방지 (1시간 쿨다운)
                const already = await alreadyLoggedRecently(
                    db,
                    plant_id,
                    "WATER_DROP_DETECTED",
                    60
                );
        
                if (!already) {
                    await db.query(`
                        INSERT INTO EVENT_LOG
                            (PLANT_ID, EVENT_TYPE, SENSOR_TYPE, SENSOR_VALUE, THRESHOLD_MIN, 
                            THRESHOLD_MAX, TEMP, HUM, LIGHT, SOIL, EVENT_DATE)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                    `, [
                        plant_id,
                        "WATER_DROP_DETECTED",
                        "soil",
                        delta,        // 변화량
                        0, 0,
                        temp_avg,
                        hum_avg,
                        lux_avg,
                        soil_avg
                    ]);        
                    console.log("✅ WATER_DROP_DETECTED 저장 완료");
                } else {
                    console.log("⏳ WATER_DROP_DETECTED 쿨다운 중");
                }
            }
        }
        
        // 이벤트 판정 및 EVENT_LOG 저장 (센서값)
        await evaluateAndLogEvents(db, plant_id, {
            temp_avg,
            hum_avg,
            lux_avg,
            soil_avg
        }, 30);
        
        res.json({ 
            success: true, 
            message: "Hourly avg saved" 
        });
    } catch (err) {
        console.error("❌ hourly 저장 실패:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. 대시보드 실시간(최근 1시간) 데이터
router.get('/current-status', async (req, res) => {
    // 가장 최근에 저장된 데이터 1개만 가져오기
    const sql = `
        SELECT 
            p.SPECIES_ID,
            d.RECOMMENDED_CYCLE,
            (SELECT TEMP_AVG FROM EVENT_LOG_HOURLY ORDER BY created_at DESC LIMIT 1) 
                AS temp,
            (SELECT HUM_AVG FROM EVENT_LOG_HOURLY ORDER BY created_at DESC LIMIT 1) 
                AS hum,
            (SELECT LIGHT_AVG FROM EVENT_LOG_HOURLY ORDER BY created_at DESC LIMIT 1)
                AS light,
            (SELECT CREATED_AT FROM EVENT_LOG_HOURLY ORDER BY created_at DESC LIMIT 1) 
                AS last_update,
            (SELECT EVENT_DATE 
                FROM EVENT_LOG 
                    WHERE SENSOR_TYPE = 'SOIL' 
                        ORDER BY EVENT_DATE 
                            DESC LIMIT 1) AS last_soil_date
        FROM PLANT_INFO p
            JOIN PLANT_DICT d 
                ON p.SPECIES_ID = d.SPECIES_ID
                LIMIT 1
        `;
                // WHERE p.PLANT_ID = 1
    try {
        const [rows] = await db.query(sql);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ message: '아직 쌓인 데이터가 없네?' });
        }
    } catch (err) {
        console.error('DB 조회 에러:', err);
        res.status(500).json({ error: '서버 에러 발생' });
    }    
});

// 4. 대시보드 7일 평균 데이터
router.get('/average-stats/:email', async (req, res) => {
    try {
        const { email } = req.params;
        // 유저의 식물 ID를 먼저 찾고 해당 식물의 로그를 가져와야 해!
        const sql = `
            SELECT 
                DATE(e.CREATED_AT) AS date,
                ROUND(AVG(e.TEMP_AVG), 1) AS TEMP_AVG,
                ROUND(AVG(e.HUM_AVG), 1) AS HUMI_AVG,
                ROUND(AVG(e.LIGHT_AVG), 1) AS LIGHT_AVG
                    FROM event_log_hourly e
                        JOIN plant_info p 
                            ON e.plant_id = p.plant_id
                        JOIN user_info u 
                            ON p.user_id = u.user_id
                    WHERE u.EMAIL = ? 
                        AND e.CREATED_AT >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                            GROUP BY DATE(e.CREATED_AT)
            ORDER BY date ASC;
        `;
        const [rows] = await db.query(sql, [email]);
        res.status(200).json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: "평균 데이터 로드 실패" });
    }
});



module.exports = router;