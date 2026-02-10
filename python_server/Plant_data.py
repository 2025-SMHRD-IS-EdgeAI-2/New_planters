#!/usr/bin/env python
# coding: utf-8

# In[1]:


import pandas as pd
import numpy as np
import json

# infodata = pd.read_json("./Python Study/data/plantinfo.json")
# namedata = pd.read_json("./Python Study/data/plantname.json")


infodata = pd.read_json("plantinfo.json")
namedata = pd.read_json("plantname.json")


# In[2]:


# 이름 데이터와 정보 데이터 병합
combined_data = pd.merge(namedata , infodata, on = "SPECIES_ID", how = "left")
combined_data.head(2)


# In[3]:


# 빈칸 결측치 nan값으로!
# r'^\s*$' : (정규식) 시작부터 끝까지 공백만 있거나 아예 아무것도 없는 글자
combined_data = combined_data.replace(r'^\s*$', np.nan, regex=True)
combined_data.info()


# In[4]:


# null 값 개수
combined_data.isna().sum()


# In[5]:


# & combined_data["FUNCTION_INFO"].isnull()
water_null = combined_data[combined_data["WATER_CYCLE"].isnull()]
water_null.head(1)


# In[6]:


temp_null = combined_data[combined_data["TEMP"].isnull()]
temp_null.head(1)


# In[7]:


hum_null = combined_data[combined_data["HUM"].isnull()]
hum_null.head(1)


# In[8]:


combined_data[combined_data["SPECIES_NAME"].str.contains("율마", na=False)]


# In[9]:


combined_data = combined_data.dropna(subset=["TEMP","HUM","WATER_CYCLE"])
combined_data.isna().sum()


# In[10]:


# 한글, 숫자, 공백이 아닌 글자(특수문자, 괄호 등)가 포함된 행만 추출
weird_names = combined_data[combined_data['SPECIES_NAME'].str.contains(r'[^가-힣0-9\s]', regex=True)]
weird_names.head(2)


# In[11]:


# '', (), 쉼표 없애기!
combined_data['SPECIES_NAME'] = (
    combined_data['SPECIES_NAME']
    .str.replace(r"[\(\)\[\]\'\",]", ' ', regex=True) # 기호들을 공백 한 칸으로!
    .str.replace(r'\s+', ' ', regex=True)  # 공백이 여러 개면 한 칸으로 합치기
    .str.strip()                          # 앞뒤에 붙은 불필요한 공백 제거
)


# In[12]:


combined_data.head(4)


# In[13]:


combined_data["PLACE_INFO"]


# In[14]:


combined_data_place = combined_data['PLACE_INFO'].unique()[:10]
print(combined_data_place)


# In[15]:


# 괄호 앞 공백 없애고, 쉼표 뒤 공백 넣기
combined_data["PLACE_INFO"] = (
    combined_data["PLACE_INFO"]
    .str.replace(r'\s+\(', '(', regex=True)        # 괄호 앞 공백 삭제
    .str.replace(r',([^\s])', r', \1', regex=True) # 쉼표 뒤에 글자가 바로 오면 공백 추가
    .str.strip()                                   # 앞뒤 공백 정리
)
combined_data.head(2)


# In[16]:


combined_data["FUNCTION_INFO"]


# In[17]:


# \r\n 없애기
pattern = r"[^가-힣a-zA-Z0-9\s.,!?\(\)~]"
combined_data['FUNCTION_INFO'] = (
    combined_data['FUNCTION_INFO']
    .str.replace(pattern, '', regex=True)     # 지정한 것 외 특수문자 삭제
    .str.replace(r'[\r\n]+', ' ', regex=True) # 줄바꿈을 공백으로
    .str.replace(r'\s+', ' ', regex=True)     # 중복 공백을 한 칸으로
    .str.strip()                             # 앞뒤 공백 제거
)
combined_data['FUNCTION_INFO'].head(3)


# In[37]:


# 'cleaned_function_info.txt' 파일로 전체 저장
with open('cleaned_function_info.txt', 'w', encoding='utf-8') as f:
    for i, text in enumerate(combined_data['LIGHT']):
        f.write(f"[{i}] {text}\n")
        f.write("-" * 50 + "\n")


# In[19]:


# 영문으로 되어있는 행
# 11, 21, 91, 102, 127, 132, 143, 153, 168, 203, 212, 216
# 사소한 교정 : 26
# NaN 처리
combined_data.at[11, 'FUNCTION_INFO'] = '초보 집사도 키울 수 있습니다.'
combined_data.at[20, 'FUNCTION_INFO'] = '아프리카 바이올렛 혼합물과 같은 좋은 풍부한 화분 토양(물은 잘 유지되지만 배수가 잘되는 토양)을 사용합니다. 자신만의 혼합물을 원한다면 휴무스 1부(잎 곰팡이), 이탄 1부, 거친 모래 또는 펄라이트 1부를 사용하세요. 항상 구멍이 있는 화분을 사용하세요. 일반 설명이 있는 이 착생 브로멜리아드의 넓고 푸른 장미는 꽃이 피면서 중앙이 붉게 물듭니다. 브라질 열대림이 원산지입니다. 네오레겔리아 카롤리나는 가죽 같은 아치형 스트랩 모양의 상록 장미를 생산하며, 가장자리가 미세하게 톱니 모양입니다. 장미의 중앙에 있는 잎 베이스는 물을 잡아 보관하는 관 모양의 컵을 형성합니다. 성숙한 장미는 붉게 물든 물컵 안에 보관된 돔 모양의 꽃머리에 작은 라벤더 꽃을 피웁니다. 장미는 개화 후에 죽어 오프셋(강아지)을 생성합니다. 이 열대 나무꾼은 습도, 따뜻함, 촉촉하고 배수가 잘되는 재배 매체를 좋아합니다. 열대 정원이나 온실의 나뭇가지에 고정하거나 유기물(스파그넘이나 펠릿 껍질과 같은)이 풍부한 다공성 화분 혼합물에서 재배하세요. 장미 컵은 특히 직사광선에 노출된 식물의 경우 봄부터 가을까지 물로 가득 차 있습니다. 늦가을부터 겨울까지 물을 절약하세요. 붉게 물을 마시면 서리가 없는 정원을 위한 좋은 경계 포인트 또는 덩어리 지면 커버가 됩니다. 이 브로멜리아드의 이름을 딴 것 중 하나는 플란드리아로, 가장자리가 크림색 잎과 밝은 주홍색 중심이 있습니다. 다양한 삼색 잎에는 옅은 노란색과 분홍색 줄무늬가 있습니다'
combined_data.at[25, 'FUNCTION_INFO'] = '덕구리란(nolina recurvata) 도꾸리란 (Beaucarnea recurvata) 줄기 밑동에 물을 많이 저장하여 술병처럼 부푼 모양으로 비대한 줄기에 수분을 저장하고 있어 과습한 경우에 줄기가 물러질 수 있다. 덕리(돗쿠리)는 입구가 좁고 긴 술병(일본어) 모습을 하고 있어 붙여진 이름으로 덕구리난은 실내가 실내가 고온건조하고 햇빛이 잘 드는 곳에서 자란다. 반음지에서도 자라긴 하나 너무 음지에서 자라면 웃자라서 모양이 망가지니 햇빛을 충분히 받도록 해야 한다. 덕구리난은 봄부터 가을 사이에는 화분의 흙 표면이 마르면 물을 충분히 주고, 더운 시기에는 잎에 물을 주고 추운시기에는 흙을 좀더 건조하게 관리한다. 5~10월에 완효성비료를 2개월에 한번 주고, 습기가 많으면 깍지벌레가 발생하기 쉬우니 주의한다.'
combined_data.at[88, 'FUNCTION_INFO'] = '물을 잘 유지하면서 배수가 잘 되는 좋은 범용 화분용 토양이면 충분합니다. 구입한 토양이 잘 통기되는지 확인하고 모래나 펄라이트, 이탄 이끼가 너무 빽빽하게 포장된 것 같으면 추가하세요. 성공적인 수정 프로그램으로 돌아가기 전에 식물이 정착할 수 있는 기회를 주세요. 자신만의 혼합을 원한다면 정원 토양 1부, 거친 모래나 펄라이트 1부, 촉촉한 이탄이나 휴무스(잎 곰팡이) 1부, 석회 가루를 가볍게 뿌려주세요. 항상 구멍이 있는 화분을 사용하세요. 성장률 평균 성장 용이성 누구에게나 쉽게 성장할 수 있습니다'
combined_data.at[99, 'FUNCTION_INFO'] = '이 식물은 사실 야자수가 아니라 사이카드입니다. 원래 일본과 한국에서 유래한 이 식물은 수세기 동안 재배되어 왔습니다. 까다롭고 관리하기 쉬우며 장수하는 하우스 식물로도 키울 수 있습니다. 느리게 자라는 것으로 유명하지만 몇 주 안에 갑자기 행동으로 옮겨져 몇 개의 새로운 잎이 자라는 경우가 많습니다. 사고 야자는 여름 파티오에 큰 도움이 되지만 더 큰 표본을 정원에 심을 수도 있습니다. 성숙한 식물은 꽤 심한 서리를 견딜 수 있지만 어린 식물은 추운 날씨에 잘 견디지 못합니다. 토양 유형 물을 잘 유지하면서 배수가 잘 되는 좋은 범용 화분 토양이면 충분합니다. 구입한 토양이 잘 통기되는지 확인하고 모래 또는 펄라이트와 이탄 이끼를 추가합니다. 식물이 성공적인 비료 프로그램으로 돌아가기 전에 정착할 수 있는 기회를 주세요. 정원 토양 1부, 거친 모래 또는 펄라이트 1부, 촉촉한 이탄 또는 휴무스(잎 곰팡이) 1부, 석회를 가볍게 털어냅니다. 항상 구멍이 있는 화분을 사용하세요.'
combined_data.at[122, 'FUNCTION_INFO'] = '수분을 잘 유지하면서 배수가 잘 되는 좋은 풍부한 화분용 토양을 사용합니다. 자신만의 혼합을 원한다면 정원 토양 1부, 거친 모래 또는 펄라이트 1부, 이탄 또는 휴무스 2부(잎 곰팡이)를 사용하세요. 항상 구멍이 있는 화분을 사용하세요. 재배가 용이하려면 약간의 추가 관리가 필요합니다'
combined_data.at[127, 'FUNCTION_INFO'] = '좋은 범용 화분용 토양(물을 잘 유지하면서 배수가 잘 되는 토양)이면 충분합니다. 구입한 토양이 잘 통기되는지 확인하고 모래나 펄라이트, 이탄 이끼를 추가하여 너무 빽빽하게 포장된 것처럼 보이면 확인하세요. 수정 프로그램이 성공적으로 진행된 곳으로 돌아가기 전에 식물이 정착할 수 있는 기회를 주세요. 자신만의 흙을 섞으려면 정원 토양 1부, 거친 모래나 펄라이트 1부, 촉촉한 이탄이나 휴무스(잎 곰팡이) 1부, 석회를 가볍게 뿌립니다. 항상 구멍이 있는 화분을 사용하세요. 재배 용이성 누구에게나 쉽게 자랄 수 있습니다.'
combined_data.at[136, 'FUNCTION_INFO'] = '씨앗 심기 3월부터 5월까지, 유카는 북미와 중앙 아메리카 남부의 사막과 평원에서 생산되며, 단단하고 가죽 같은 잎과 크리미한 흰색 꽃으로 이루어진 판니클로 훌륭한 건축 식물을 만듭니다. Y. 엘리펀트이페스는 거칠지만 가시가 없는 연한 녹색에서 중간 녹색의 잎을 가지고 있습니다. 실내 식물이나 파티오 식물로 키울 수 있지만 겨울에는 서리가 내리지 않는 곳이 필요합니다. 뛰어난 식물을 위한 정원 공로상(AGM)을 수상했습니다.'
combined_data.at[160, 'FUNCTION_INFO'] = '배수가 잘되는 빛, 습윤한 모래. 열대와 극동 지역에서 발견되는 상록수 관목으로 높이가 3m까지 자랍니다. 주요 매력은 짙은 녹색에 노란색, 분홍색, 주황색, 빨간색의 정맥이 있는 광택이 나는 잎이며, 원산지에서는 장식용 울타리로 자주 사용됩니다. 영국에서는 따뜻한 실내나 온실에 이상적인 매력적인 식물로 키울 수 있습니다. 이 식물은 16도에서 29도 사이의 일정한 온도와 통풍구에서 밝은 조명이 필요하기 때문에 관리하기가 다소 까다로울 수 있습니다. 또한 습도가 높아 정기적으로 안개를 뿌려서 최상의 상태를 유지해야 합니다. 여름에는 물을 잘 공급하지만 겨울에는 드물게 유지하세요.'
combined_data.at[193, 'FUNCTION_INFO'] = '하트 모양의 잎이 매력적인 관엽식물이다. 아프리카 바이올렛 믹스와 같은 좋은 풍부한 화분용 흙(물은 잘 유지되지만 배수가 잘 되는 흙)을 사용하세요. 자신만의 흙을 섞으려면 정원용 흙 2부, 휴무스(잎 곰팡이) 2부, 거친 모래 또는 펄라이트 1부, 헹구어진 수족관 숯 조각 1부, 그리고 약간의 고급 전나무 껍질을 사용하세요. 항상 구멍이 뚫린 화분을 사용하세요. 재배가 쉬워지면 각별한 주의가 필요합니다'
combined_data.at[200, 'FUNCTION_INFO'] = '좋은 범용 화분용 흙(물은 잘 유지되지만 배수가 잘 되는 흙)이면 충분합니다. 구입한 흙이 잘 통기되는지 확인하고 모래나 펄라이트와 이탄 이끼를 추가하여 너무 빽빽하게 포장된 것처럼 보이면 확인하세요. 성공적인 수정 프로그램으로 돌아가기 전에 식물이 정착할 수 있는 기회를 주세요. 자신만의 흙을 섞으려면 정원용 흙 1부, 거친 모래나 펄라이트 1부, 촉촉한 이탄이나 휴무스(잎 곰팡이) 1부, 석회 가루를 살짝 뿌려주세요. 항상 구멍이 있는 화분을 사용하세요. 재배 용이성 누구에게나 쉽게 자랄 수 있습니다'
combined_data.at[204, 'FUNCTION_INFO'] = '장식용 및 하우스플랜트 토양 타입. 촉촉하고 풍부하며 배수가 잘되는 환경이면 누구나 쉽게 키울 수 있습니다'
combined_data['FUNCTION_INFO'] = combined_data['FUNCTION_INFO'].fillna('정보 없음')
combined_data = combined_data.reset_index(drop=True)


# In[20]:


combined_data.isna().sum()


# In[21]:


combined_data['WATER_CYCLE'].unique()


# In[22]:


# 관수
# '화분 흙 대부분 말랐을때 충분히 관수함' : 14일
# '토양 표면이 말랐을때 충분히 관수함' : 7일
# '흙을 촉촉하게 유지함(물에 잠기지 않도록 주의)' : 5일
# '항상 흙을 축축하게 유지함(물에 잠김)' : 2일
# https://www.thesill.com/pages/care-library


# In[23]:


combined_data[combined_data["SPECIES_NAME"].str.contains("알로카", na=False)]


# In[24]:


# 1. 축축 -> 2
combined_data.loc[combined_data['WATER_CYCLE'].str.contains('축축', na=False), 'RECOMMENDED_CYCLE'] = 2

# 2. 촉촉 -> 5
combined_data.loc[combined_data['WATER_CYCLE'].str.contains('촉촉', na=False), 'RECOMMENDED_CYCLE'] = 5

# 3. 표면 -> 7
combined_data.loc[combined_data['WATER_CYCLE'].str.contains('표면', na=False), 'RECOMMENDED_CYCLE'] = 7

# 4. 대부분 -> 14
combined_data.loc[combined_data['WATER_CYCLE'].str.contains('대부분', na=False), 'RECOMMENDED_CYCLE'] = 14


# In[25]:


combined_data["RECOMMENDED_CYCLE"].astype(int)


# In[26]:


# 온도(TEMP)에서 숫자만 추출해서 분리하기
# \d+ : '하나 이상의 숫자'를 의미함
temp_list = combined_data['TEMP'].str.findall(r'\d+')

combined_data['TEMP_MIN'] = temp_list.str[0] # 첫 번째 숫자
combined_data['TEMP_MAX'] = temp_list.str[1] # 두 번째 숫자

combined_data.head(5)


# In[27]:


# 2. 습도(HUM)에서 숫자만 추출해서 분리하기
hum_list = combined_data['HUM'].str.findall(r'\d+')
for i in range(0, len(hum_list)):
    if len(hum_list[i]) == 2:
        combined_data.loc[i, 'HUM_MIN'] = hum_list[i][0]
        combined_data.loc[i, 'HUM_MAX'] = hum_list[i][1]
    elif hum_list[i][0] == '40':
        combined_data.loc[i, 'HUM_MAX'] = hum_list[i][0]
    elif hum_list[i][0] == '70':
        combined_data.loc[i, 'HUM_MIN'] = hum_list[i][0]
combined_data['HUM_MIN'] = combined_data['HUM_MIN'].fillna('0')
combined_data['HUM_MAX'] = combined_data['HUM_MAX'].fillna('100')


# In[33]:


combined_data['HUM_MIN'] = combined_data['HUM_MIN'].astype(int)
combined_data['HUM_MAX'] = combined_data['HUM_MAX'].astype(int)
combined_data['TEMP_MIN'] = combined_data['TEMP_MIN'].astype(int)
combined_data['TEMP_MAX'] = combined_data['TEMP_MAX'].astype(int)
combined_data['RECOMMENDED_CYCLE'] = combined_data['RECOMMENDED_CYCLE'].astype(int)


# In[36]:


combined_data2 = combined_data.drop(columns=['HUM', 'TEMP'])
combined_data2.head(2)


# In[49]:


# 데이터에서 쉼표 없애기
combined_data2['LIGHT'] = combined_data2['LIGHT'].str.replace(',', '', regex=False)

# 2. 조도(LIGHT)에서 숫자만 추출해서 분리하기
light_list = combined_data2['LIGHT'].str.findall(r'\d+')
combined_data2['LUX_MIN'] = None
combined_data2['LUX_MAX'] = None


for i in range(len(light_list)):
    lux = [int(n) for n in light_list[i]]
    combined_data2.loc[i, 'LUX_MIN'] = min(lux)
    combined_data2.loc[i, 'LUX_MAX'] = max(lux)
combined_data2 = combined_data2.drop(columns=['LIGHT'])
combined_data2


# In[51]:


# Json으로 저장
# combined_data2.to_json('plant_data.json', orient='records', force_ascii=False, indent=4)


# [DB에 저장]

from sqlalchemy import create_engine
# import pymysql

# DB 연결 정보
db_connection_str = 'mysql+pymysql://root:1234@localhost:3306/greensync'
db_connection = create_engine(db_connection_str)

try:
    # 가공된 데이터(combined_data2)를 'PLANT_DICT' 테이블에 넣기
    combined_data2.to_sql(name='PLANT_DICT', con=db_connection, if_exists='append', index=False)
    print("성공! DB에 식물 데이터가 저장되었습니다.")
except Exception as e:
    print(f"실패 : {e}")


# In[ ]:





# In[ ]:





# In[ ]:





# In[ ]:





# In[ ]:





# In[ ]:





# In[ ]:





# In[ ]:





# In[ ]:





# In[ ]:




