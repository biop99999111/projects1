# -*- coding: utf-8 -*-
"""CCTV 단속 구역·공영 주차장 CSV 로드 및 거리 계산."""
import csv
import math
from pathlib import Path

from django.conf import settings

# 고양시 중심 (일산) 기본 좌표
GOYANG_CENTER = (37.6584, 126.8320)

# 단속 구역 판정: 클릭 좌표와 이 거리(km) 이내면 단속 구역으로 간주
ENFORCEMENT_RADIUS_KM = 0.05  # 약 50m

# 근처 공영 주차장 반경(km)
PARKING_RADIUS_KM = 2.0


def _haversine_km(lat1, lon1, lat2, lon2):
    """두 위경도 간 거리(km)."""
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _load_csv(path, encoding='utf-8'):
    if not path or not Path(path).exists():
        return []
    rows = []
    with open(path, 'r', encoding=encoding, newline='') as f:
        try:
            reader = csv.reader(f)
            next(reader, None)  # header
            for row in reader:
                if len(row) > 0:
                    rows.append(row)
        except UnicodeDecodeError:
            with open(path, 'r', encoding='cp949', newline='') as f2:
                reader = csv.reader(f2)
                next(reader, None)
                for row in reader:
                    if len(row) > 0:
                        rows.append(row)
    return rows


def get_cctv_rows():
    """CCTV 단속 CSV 행 목록. 각 행: [관리번호, 소재지, 위도, 경도]."""
    base = getattr(settings, 'BASE_DIR', Path(__file__).resolve().parent.parent)
    path = base / 'Go-yang-si_cctv.csv'
    raw = _load_csv(str(path))
    out = []
    for row in raw:
        if len(row) < 4:
            continue
        try:
            lat = float(row[2].strip())
            lng = float(row[3].strip())
            out.append({
                'id': row[0].strip(),
                'address': row[1].strip(),
                'lat': lat,
                'lng': lng,
            })
        except (ValueError, IndexError):
            continue
    return out


def get_parking_rows():
    """공영 주차장 CSV 행. 위도·경도는 마지막에서 3번째, 2번째 컬럼."""
    base = getattr(settings, 'BASE_DIR', Path(__file__).resolve().parent.parent)
    path = base / 'Go-yang-si_parking_lot.csv'
    raw = _load_csv(str(path))
    out = []
    # 헤더: ... 전화번호,위도,경도,장애인...
    for row in raw:
        if len(row) < 27:
            continue
        try:
            lat = float(row[25].strip())
            lng = float(row[26].strip())
            name = row[2].strip() if len(row) > 2 else ''
            address = row[6].strip() if len(row) > 6 else (row[5].strip() if len(row) > 5 else '')
            fee = row[16].strip() if len(row) > 16 else ''
            out.append({
                'name': name,
                'address': address,
                'fee': fee,
                'lat': lat,
                'lng': lng,
            })
        except (ValueError, IndexError):
            continue
    return out


def check_enforcement(lat, lng):
    """해당 위경도가 단속 구역인지 확인. 단속이면 cctv 정보 반환."""
    cctv_list = get_cctv_rows()
    for c in cctv_list:
        km = _haversine_km(lat, lng, c['lat'], c['lng'])
        if km <= ENFORCEMENT_RADIUS_KM:
            return {
                'is_enforcement': True,
                'cctv': {
                    'id': c['id'],
                    'address': c['address'],
                    'lat': c['lat'],
                    'lng': c['lng'],
                },
            }
    return {'is_enforcement': False, 'cctv': None}


def get_nearby_parking(lat, lng, radius_km=None):
    """해당 위경도 기준 반경(기본 2km) 이내 공영 주차장 목록."""
    radius_km = radius_km or PARKING_RADIUS_KM
    parking_list = get_parking_rows()
    result = []
    for p in parking_list:
        km = _haversine_km(lat, lng, p['lat'], p['lng'])
        if km <= radius_km:
            result.append({
                **p,
                'distance_km': round(km, 2),
            })
    result.sort(key=lambda x: x['distance_km'])
    return result[:20]  # 최대 20개
