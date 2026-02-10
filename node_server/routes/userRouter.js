const express = require('express');
const router = express.Router();
const db = require("../config/db.js");

// 1. 회원가입 : 처리 주소 >> :3001/api/user/signup
router.post('/signup', async (req, res) => {
    const { name, email, pw } = req.body;

    // (1) 필수값 체크
    if (!name || !email || !pw) {
        return res.status(400).json({ 
            success: false, 
            message: "잘못 입력하셨습니다." 
        });
    }
    try {
        // (2) DB(MariaDB)에 저장
        const sql = "INSERT INTO USER_INFO (USER_ID, EMAIL, PASSWORD) VALUES (?, ? , ?)";
        const params = [name, email, pw];
        // 구조 분해 할당 > 프로미스 방식이기에...
        // db.execute는 배열 형태로 넘어오며, 0번에 값 1번에 추가 정보 가져옴
        // "왼쪽 대괄호 []의 첫 번째 칸에 있는 이름(result)에다가, 
        // 오른쪽 배열의 0번 데이터를 담아줄게!"
        const [result] = await db.execute(sql, params)
        // affectedRows : 변화된 줄이 있느냐로 판단
        if (result.affectedRows > 0) {
            // 가입 성공 (core4_jss.js로 res)
            res.json({
                success :true,
                message : "회원가입 성공"
            });
        }        
    } catch (err) {
        // (3) 에러 처리
        res.json({
            success: false,
            message: `회원가입 실패 ${err}`
        });
    }
});

// 2. 로그인 : 처리 주소 >> :3001/api/user/login
router.post('/login', async (req, res) => {
    try {
        const { email, pw } = req.body;
        const sql = "SELECT * FROM USER_INFO WHERE EMAIL = ? AND PASSWORD = ?";
        const params = [ email, pw ];

        const [rows] = await db.execute(sql, params);

        // 로그인 성공
        if (rows.length > 0) {
            console.log("=== [로그인] DB에서 가져온 정보 ===");
            // console.log(rows[0]);
            // // ✨ [수정] 세션에 유저 정보를 직접 담아주자!
            // // loginSuccess 같은 변수 대신 rows[0] 데이터를 바로 쓰면 돼.
            // req.session.user = {
            //     EMAIL: rows[0].EMAIL,
            //     USER_ID: rows[0].USER_ID,
            //     // 만약 이름이나 다른 정보도 필요하면 여기에 추가해!
            // };

            // console.log("=== [로그인] 세션 저장 직후 ===");
            // console.log(req.session.user);

            res.json({
                success : true,
                message : "로그인 성공",
                user : {email : email}
            });
        } else {
            // 로그인 실패 (일치하는 유저 없음)
            res.json({
                success : false,
                message : "이메일 또는 비밀번호가 일치하지 않습니다."
            });
        }
    } catch (err) {
                res.json({
                success : false,
                message : `로그인 실패 ${err}`
            })
        }
    });

    // 내 정보 조회 라우터
    router.get('/profile/:email', async (req, res) => {
        const { email } = req.params;
    
        try {
            // 이메일로 사용자의 이름과 이메일을 가져오기
            const sql = "SELECT USER_ID, EMAIL, CREATED_AT FROM USER_INFO WHERE EMAIL = ?";
            const [rows] = await db.execute(sql, [email]);

            if (rows.length > 0) {
                res.json({
                    success: true,
                    userName: rows[0].USER_ID,
                    email: rows[0].EMAIL,
                    createAt :rows[0].CREATED_AT
                });
            } else {
                res.json({ success: false, message: "사용자를 찾을 수 없어!" });
            }
        } catch (err) {
            console.error("프로필 조회 에러:", err);
            res.status(500).json({ success: false, message: "서버 에러 발생" });
        }
    });

// 회원 탈퇴 라우터 (userRouter.js)
router.delete('/withdraw/:email', async (req, res) => {
    const { email } = req.params;
    
    try {
        // 1. 유저의 식물 정보부터 먼저 지우거나, 
        // 2. USER_INFO를 지우면 식물도 같이 지워지게 DB 설정을 했겠지만, 안전하게 쿼리 작성!
        const deletePlantSql = "DELETE p FROM PLANT_INFO p JOIN USER_INFO u ON p.USER_ID = u.USER_ID WHERE u.EMAIL = ?";
        await db.execute(deletePlantSql, [email]);

        // 3. 실제 유저 정보 삭제
        const deleteUserSql = "DELETE FROM USER_INFO WHERE EMAIL = ?";
        const [result] = await db.execute(deleteUserSql, [email]);

        if (result.affectedRows > 0) {
            res.json({ success: true, message: "탈퇴 완료" });
        } else {
            res.json({ success: false, message: "해당 유저를 찾을 수 없어!" });
        }
    } catch (err) {
        console.error("탈퇴 처리 중 에러:", err);
        res.status(500).json({ success: false, message: "서버 탈퇴 에러" });
    }
});


module.exports = router;