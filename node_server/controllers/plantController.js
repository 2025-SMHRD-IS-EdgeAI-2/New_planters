const db = require('../config/db');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data'); // axios로 파일 보낼 때 필요

exports.uploadAndAnalyze = async (req, res) => {
  try {
    const file = req.file; // 웹에서 올라온 파일, file = 파일명 바꾸기(앞)
    const plantId = req.body.plant_id;

    if (!file) return res.status(400).send('파일이 없습니다.');

    // Python 서버(8000번)로 이미지 보내서 분석 요청하기

    const formData = new FormData();
    // 저장된 파일(file)을 읽어서 Python에게 전송
    formData.append('file', fs.createReadStream(file.path)); // file = 파일명 바꾸기

    const pythonResponse = await axios.post('http://127.0.0.1:8000/analyze', formData, {
      headers: { ...formData.getHeaders() }
    });


// [새 기능] 식물 등록하기 (도감 검색 포함)
exports.registerPlant = async (req, res) => {
    try {
        console.log("🌱 식물 등록 요청:", req.body);
        const { name, type, date } = req.body; // type = "몬스테라"
        const userId = 'test_user'; // (나중에 로그인 기능 생기면 바꿀 예정)

        // 1. 도감(PLANT_DICT)에서 식물 ID 찾기
        // 사용자가 "몬스"만 입력해도 찾을 수 있게 LIKE 사용 (%검색어%)
        const searchSql = 'SELECT SPECIES_ID FROM PLANT_DICT WHERE SPECIES_NAME LIKE ? LIMIT 1';
        const [dictResult] = await db.query(searchSql, [`%${type}%`]);

        if (dictResult.length === 0) {
            return res.status(400).json({ error: "도감에 없는 식물입니다. 이름을 정확히 입력해주세요!" });
        }

        const speciesId = dictResult[0].SPECIES_ID; // 찾은 ID (예: 123번)
        console.log(`🔍 도감 매칭 성공: ${type} -> ID ${speciesId}`);

        // 2. 내 식물로 등록 (PLANT_INFO)
        const insertSql = `
            INSERT INTO PLANT_INFO (USER_ID, SPECIES_ID, PLANT_NAME, PLANT_DATE) 
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await db.query(insertSql, [userId, speciesId, name, date]);

        res.json({ 
            message: `등록 성공! (종류: ${type})`, 
            plantId: result.insertId 
        });

    } catch (error) {
        console.error("❌ 등록 에러:", error);
        res.status(500).json({ error: "서버 에러 발생" });
    }
};



    // Python이 알려준 식물 키
    const analyzedHeight = pythonResponse.data.height;

// 3. MySQL DB에 저장
        // IMG_DATA 테이블에 '누구 거인지(PLANT_ID)', '어디 있는지(IMG_PATH)', '키는 몇인지(HEIGHT_VAL)'를 저장
        
        const sql = 'INSERT INTO IMG_DATA (PLANT_ID, IMG_PATH, HEIGHT_VAL) VALUES (?, ?, ?)';
        
        // 데이터 순서 중요! (ID, 경로, 키)
        await db.query(sql, [plantId, file.path, analyzedHeight]);

        console.log("DB 저장 완료");
        


    // 웹(사용자)에게 최종 응답
    res.json({
      message: '분석 및 저장 성공!',
      height: analyzedHeight,
      imagePath: file.path // file = 파일명 바꾸기
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '서버 에러 발생' });
  }
};


