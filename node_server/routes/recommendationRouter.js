// sensorRoutes.js는 데이터 생성/저장 책임
// recommendationRoutes.js는 의사결정/해석 책임
// 센서 수집과 추천 로직을 분리해서 데이터 파이프라인과 의사결정 로직을 독립적으로 설계

// 토양수분 센서는 실시간 상태 판단에 사용하고, 물주기 기준은 식물 종별로 사전에 정의된 권장 주기를 사용
// 실측 센서 데이터는 권장 주기를 단축,유지,연장하는 보정 신호로 활용


// Python(sensor.py) = 수집 · 평균 계산 · 전달
// Node(hourly API) = 판단 · 이벤트 생성 · 알림

const express = require("express");
const router = express.Router();
const db = require("../config/db");

/* -----------------------------
   공통 유틸 (쿨다운)
----------------------------- */
// 알림을 5분에 한번씩 주게 하기 위한 함수
async function alreadyLoggedRecently(db, plantId, eventType, minutes = 5) {
  const [rows] = await db.query(`
    SELECT 1
      FROM EVENT_LOG
        WHERE PLANT_ID = ? AND EVENT_TYPE = ?
          AND EVENT_DATE > DATE_SUB(NOW(), INTERVAL ? MINUTE)
    LIMIT 1
  `, [plantId, eventType, minutes]);
  return rows.length > 0;
}

//  
async function insertRecommendationEventLog(db, {
  plantId,
  soil_repr,
  recommended_cycle,
  status
}) {
  // 최근 스냅샷 (hourly 기준) : 가장 최근의 평균 데이터 1개만 가져오기
  const [snapRows] = await db.query(`
    SELECT TEMP_AVG, HUM_AVG, LIGHT_AVG, SOIL_AVG
      FROM EVENT_LOG_HOURLY
        WHERE PLANT_ID = ?
          ORDER BY END_AT DESC
    LIMIT 1
  `, [plantId]);
  // 데이터 정제하기 (데이터 없을 경우 대비)
  const snap = snapRows.length ? snapRows[0] : null;
  const temp  = snap ? Number(snap.TEMP_AVG)  : 0;
  const hum   = snap ? Number(snap.HUM_AVG)   : 0;
  const light = snap ? Number(snap.LIGHT_AVG) : 0;
  const soil  = snap ? Number(snap.SOIL_AVG)  : Number(soil_repr);

  const eventType = `WATER_RECOMMEND_${status}_${recommended_cycle}D`;

  await db.query(`
    INSERT INTO EVENT_LOG
      (PLANT_ID, EVENT_TYPE, SENSOR_TYPE,
       SENSOR_VALUE, THRESHOLD_MIN, THRESHOLD_MAX,
       TEMP, HUM, LIGHT, SOIL, EVENT_DATE)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `, [
    plantId,
    eventType,
    "soil",
    Number(soil_repr),
    0, 0,           // 추천은 임계치 개념 없으므로 0
    temp, hum, light, soil
  ]);

  return eventType;
}

/* --------------------------------
   GET /api/recommendation/water/:plantId
--------------------------------- */
router.get("/water/:plantId", async (req, res) => {
  try {
    const plantId = req.params.plantId;
    
    /* 2️⃣ plant_dict 기준 값 */
    // 관수 주기 가져오기
    const [dictRows] = await db.query(`
        SELECT pd.WATER_CYCLE, pd.RECOMMENDED_CYCLE
        FROM plant_info pi
        JOIN plant_dict pd ON pi.SPECIES_ID = pd.SPECIES_ID
        WHERE pi.PLANT_ID = ?
        LIMIT 1
        `, [plantId]);
        
        if (!dictRows.length) {
      return res.status(404).json({
        success: false,
        message: "plant_dict 정보 없음"
    });
}

// const waterCycleDays = Number(dictRows[0].RECOMMENDED_CYCLE);
const waterCycleDays = Number(
  dictRows[0].WATER_CYCLE ?? dictRows[0].RECOMMENDED_CYCLE ?? 7
);

// 마지막 물 준 시점 추정
const [lastWateredRows] = await db.query(`
    SELECT EVENT_DATE
    FROM EVENT_LOG
    WHERE PLANT_ID = ?
    AND EVENT_TYPE = 'WATER_DROP_DETECTED'
    ORDER BY EVENT_DATE DESC
        LIMIT 1
    `, [plantId]);

    // const lastWaterat = lastWateredRows[0].EVENT_DATE; // lastWateredRows 비어있으면 터짐
    const lastWaterat = lastWateredRows.length
    ? lastWateredRows[0].EVENT_DATE
    : null;

    // /* 3️⃣ soil 값 기반 상태 & 추천 주기 */
    // let status;
    // let recommended_cycle;

    /* 5️⃣ 응답 */
    return res.json({
        success: true,
        plant_id: plantId,
        recommended_cycle : waterCycleDays,
        lastWaterat : lastWaterat
    });
    
} catch (err) {
    console.error("❌ 물주기 추천 실패:", err.message);
    res.status(500).json({ success: false, message: err.message });
}
});

module.exports = router;


    // /* 1️⃣ 최근 soil 값 가져오기 */
    // const [soilRows] = await db.query(`
    //   SELECT SOIL
    //   FROM EVENT_LOG
    //   WHERE PLANT_ID = ?
    //   ORDER BY EVENT_DATE DESC
    //   LIMIT 24
    // `, [plantId]);

    // if (!soilRows.length) {
    //   return res.status(404).json({
    //     success: false,
    //     message: "soil 데이터 없음"
    //   });
    // }

    // const soilValues = soilRows
    //   .map(r => Number(r.SOIL))
    //   .filter(v => Number.isFinite(v))
    //   .sort((a, b) => a - b);

    // const mid = Math.floor(soilValues.length / 2);
    // const soil_repr =
    //   soilValues.length % 2 === 0
    //     ? (soilValues[mid - 1] + soilValues[mid]) / 2
    //     : soilValues[mid];

// // ✅ (낮을수록 습함 / 높을수록 건조) + 실측(900 wet, 1900 dry) 반영 임계치
//     if (soil_repr < 1200) {
//       status = "WET";
//       recommended_cycle = 14;
//     } else if (soil_repr < 1700) {
//       status = "OK";
//       recommended_cycle = (RECOMMENDED_CYCLE ?? 7);
//     } else if (soil_repr < 2200) {
//       status = "DRY";
//       recommended_cycle = 5;
//     } else {
//       status = "VERY_DRY";
//       recommended_cycle = 2;
//     }

// /* 4️⃣ EVENT_LOG 이력 저장 (쿨다운 60분) */
// const cooldownKey = "WATER_RECOMMEND";
// let logged = false;
// let logged_event_type = null;

// if (!(await alreadyLoggedRecently(db, plantId, cooldownKey, 60))) {
//   logged_event_type = await insertRecommendationEventLog(db, {
//     plantId,
//     soil_repr,
//     recommended_cycle,
//     status
//   });
//   logged = true;
// }