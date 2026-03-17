# -*- coding: utf-8 -*-
"""CCTV 단속 구역·공영 주차장 데이터 로드 및 거리 계산."""
import csv
import json as json_module
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path

from django.conf import settings

# 고양시 중심 (일산) 기본 좌표
GOYANG_CENTER = (37.6584, 126.8320)

# 단속 구역 판정: 클릭 좌표와 이 거리(km) 이내면 단속 구역으로 간주
ENFORCEMENT_RADIUS_KM = 0.1  # 약 100m

# 카카오 주소→좌표 변환 캐시
_GEOCODE_CACHE = {}

# 외부 API 결과 캐시 (프로세스 생명주기 동안 재사용)
_PARKING_ROWS_CACHE = None
_CCTV_ROWS_CACHE = None

# 디스크 캐시: 재시작 시 API 재호출 없이 즉시 로드 (유효 시간 초)
_DISK_CACHE_TTL_SEC = getattr(settings, "PARKING_API_CACHE_TTL_SEC", 24 * 3600)  # 기본 24시간


def _get_cache_dir():
    """디스크 캐시 저장 경로 (프로젝트 기준 .cache/parking)."""
    base = Path(settings.BASE_DIR)
    cache_dir = base / ".cache" / "parking"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


# 근처 공영 주차장 반경(km) — 500m
PARKING_RADIUS_KM = 0.5


def _haversine_km(lat1, lon1, lat2, lon2):
    """두 위경도 간 거리(km)."""
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _kakao_geocode(address: str):
    """카카오 주소 검색 API로 주소를 좌표로 변환."""
    if not address:
        return None
    cached = _GEOCODE_CACHE.get(address)
    if cached is not None:
        return cached

    rest_key = getattr(
        settings,
        "KAKAO_REST_API_KEY",
        "db210bbb1640818e0b3e3fc726869367",
    )
    try:
        params = {"query": address}
        url = "https://dapi.kakao.com/v2/local/search/address.json?" + urllib.parse.urlencode(
            params
        )
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"KakaoAK {rest_key}"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json_module.loads(resp.read().decode("utf-8"))
    except Exception:
        _GEOCODE_CACHE[address] = None
        return None

    docs = data.get("documents") or []
    if not docs:
        _GEOCODE_CACHE[address] = None
        return None

    try:
        first = docs[0]
        lat = float(first.get("y"))
        lng = float(first.get("x"))
    except (TypeError, ValueError):
        _GEOCODE_CACHE[address] = None
        return None

    _GEOCODE_CACHE[address] = (lat, lng)
    return lat, lng


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
    """경기도 고양시_주정차단속 CCTV 설치 현황(ODCloud) 기반 단속 구역 목록.

    외부 API 및 지오코딩 결과는 프로세스 단위 캐시에 저장하여
    매 요청마다 재호출하지 않도록 한다. 디스크 캐시가 유효하면 API 호출 없이 즉시 반환.
    """
    global _CCTV_ROWS_CACHE
    if _CCTV_ROWS_CACHE is not None:
        return _CCTV_ROWS_CACHE
    cache_file = _get_cache_dir() / "cctv_rows.json"
    if cache_file.exists():
        try:
            mtime = cache_file.stat().st_mtime
            if (time.time() - mtime) <= _DISK_CACHE_TTL_SEC:
                with open(cache_file, "r", encoding="utf-8") as f:
                    _CCTV_ROWS_CACHE = json_module.load(f)
                return _CCTV_ROWS_CACHE
        except Exception:
            pass
    service_key = getattr(
        settings,
        "GOYANG_CCTV_ODCLOUD_KEY",
        "60f01de3cd6f82597a051c59f13252afc161e1db0b12fe694f2f061443abe0d1",
    )
    base_url = (
        "https://api.odcloud.kr/api/15086953/v1/"
        "uddi:814bceb8-3007-490f-9420-b888f3aea4fc"
    )

    out = []
    page = 1
    per_page = 100

    while True:
        params = {
            "page": page,
            "perPage": per_page,
            "serviceKey": service_key,
        }
        url = base_url + "?" + urllib.parse.urlencode(params)
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                data = json_module.loads(resp.read().decode("utf-8"))
        except Exception:
            break

        rows = data.get("data") or []
        if not rows:
            break

        for item in rows:
            addr = item.get("설치주소") or ""
            spot = item.get("설치지점") or ""
            if addr and "고양시" not in addr:
                # 다른 시 데이터가 섞여 있을 경우를 대비해 필터
                continue

            full_addr = f"{addr} {spot}".strip()
            geo = _kakao_geocode(full_addr or addr)
            if not geo:
                continue
            lat, lng = geo

            out.append(
                {
                    "id": str(item.get("연번", "")),
                    "address": full_addr or addr,
                    "lat": lat,
                    "lng": lng,
                }
            )

        if len(rows) < per_page:
            break
        page += 1

    _CCTV_ROWS_CACHE = out
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json_module.dump(out, f, ensure_ascii=False, indent=0)
    except Exception:
        pass
    return _CCTV_ROWS_CACHE


def _fetch_parking_rows_from_openapi():
    """경기데이터드림 OPEN API(공영주차장)에서 고양시 데이터 조회."""
    api_key = getattr(
        settings,
        "GG_PARKING_OPENAPI_KEY",
        "1d7210208912479893aac27da2df3248",
    )
    base_url = "https://openapi.gg.go.kr/ParkingPlace"

    rows = []
    page = 1
    page_size = 1000

    while True:
        # SIGUN_NM으로 바로 필터하면 지자체 명칭 변경(고양특례시 등) 시
        # 전체 데이터가 비어버릴 수 있으므로, 전체를 조회한 뒤
        # 아래에서 '고양'이 포함된 시군만 필터링한다.
        params = {
            "KEY": api_key,
            "Type": "json",
            "pIndex": page,
            "pSize": page_size,
        }
        url = base_url + "?" + urllib.parse.urlencode(params)
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                data = json_module.loads(resp.read().decode("utf-8"))
        except Exception:
            break

        items = data.get("ParkingPlace")
        payload = None
        if isinstance(items, list):
            # 구조: {"ParkingPlace":[{"head":[...]},{"row":[...]}]}
            for elem in items:
                if isinstance(elem, dict) and "row" in elem:
                    payload = elem
                    break
        elif isinstance(items, dict):
            payload = items
        else:
            payload = data.get("ParkingPlace", {})

        row_list = payload.get("row") if isinstance(payload, dict) else None
        if not row_list:
            break

        rows.extend(row_list)
        if len(row_list) < page_size:
            break
        page += 1

    out = []

    def _g(item, key, default=""):
        v = item.get(key, default)
        if v is None:
            return default
        if isinstance(v, str):
            return v.strip()
        return v

    for item in rows:
        # 시군명이 '고양'이 포함된 데이터(고양시/고양특례시 등)만 사용
        sigun_nm = _g(item, "SIGUN_NM")
        if sigun_nm and "고양" not in sigun_nm:
            continue

        try:
            lat = float(_g(item, "REFINE_WGS84_LAT"))
            lng = float(_g(item, "REFINE_WGS84_LOGT"))
        except (TypeError, ValueError):
            continue

        addr_r = _g(item, "LOCPLC_ROADNM_ADDR")
        addr_j = _g(item, "LOCPLC_LOTNO_ADDR")

        out.append(
            {
                "name": _g(item, "PARKPLC_NM"),
                "address": addr_j or addr_r,
                "parking_type": _g(item, "PARKPLC_TYPE"),  # 노상/노외 등
                "address_road": addr_r,
                "address_jibun": addr_j,
                "capacity": _g(item, "PARKNG_COMPRT_PLANE_CNT"),
                "operating_days": _g(item, "SUBTL_IMPLMTN_DIV_NM"),
                "weekday_start": _g(item, "WKDAY_OPERT_BEGIN_TM"),
                "weekday_end": _g(item, "WKDAY_OPERT_END_TM"),
                "saturday_start": _g(item, "SAT_OPERT_BEGIN_TM"),
                "saturday_end": _g(item, "SAT_OPERT_END_TM"),
                "holiday_start": _g(item, "HOLIDAY_OPERT_BEGIN_TM"),
                "holiday_end": _g(item, "HOLIDAY_OPERT_END_TM"),
                "fee": _g(item, "CHRG_INFO"),
                "base_minutes": _g(item, "PARKNG_BASIS_TM"),
                "base_fee": _g(item, "PARKNG_BASIS_USE_CHRG"),
                "extra_unit_minutes": _g(item, "ADD_UNIT_TM"),
                "extra_unit_fee": _g(item, "ADD_UNIT_TM2_WITHIN_USE_CHRG"),
                "day_pass_hours": _g(item, "DAY1_PARKTK_CHRG_APPLCTN_TM"),
                "day_pass_fee": _g(item, "DAY1_PARKTK_USE_CHRG"),
                "monthly_fee": _g(item, "MT_CMMTICKT_WEEK_USE_CHRG"),
                "phone": _g(item, "CONTCT_NO"),
                "lat": lat,
                "lng": lng,
                "disabled_space": "",  # OPEN API에 별도 필드가 없으므로 공백
            }
        )

    return out


def get_parking_rows():
    """공영 주차장 데이터: 경기데이터드림 OPEN API만 사용.

    외부 API 결과는 프로세스 단위 캐시에 보관하여
    매 요청마다 재호출하지 않도록 한다. 디스크 캐시가 유효하면 API 호출 없이 즉시 반환.
    """
    global _PARKING_ROWS_CACHE
    if _PARKING_ROWS_CACHE is not None:
        return _PARKING_ROWS_CACHE
    cache_file = _get_cache_dir() / "parking_rows.json"
    if cache_file.exists():
        try:
            mtime = cache_file.stat().st_mtime
            if (time.time() - mtime) <= _DISK_CACHE_TTL_SEC:
                with open(cache_file, "r", encoding="utf-8") as f:
                    _PARKING_ROWS_CACHE = json_module.load(f)
                return _PARKING_ROWS_CACHE
        except Exception:
            pass

    # 경기데이터드림 OPEN API에서 한 번만 조회 후 캐시에 저장
    api_rows = _fetch_parking_rows_from_openapi()
    _PARKING_ROWS_CACHE = api_rows or []
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json_module.dump(_PARKING_ROWS_CACHE, f, ensure_ascii=False, indent=0)
    except Exception:
        pass
    return _PARKING_ROWS_CACHE


def get_all_parking_simple():
    """검색용 전체 공영 주차장 리스트 (거리 계산 없음)."""
    parking_list = get_parking_rows()
    return [
        {
            'name': p['name'],
            'address': p.get('address') or p.get('address_jibun') or p.get('address_road', ''),
            'parking_type': p.get('parking_type', ''),
            'address_road': p.get('address_road', ''),
            'address_jibun': p.get('address_jibun', ''),
            'capacity': p.get('capacity', ''),
            'operating_days': p.get('operating_days', ''),
            'weekday_start': p.get('weekday_start', ''),
            'weekday_end': p.get('weekday_end', ''),
            'saturday_start': p.get('saturday_start', ''),
            'saturday_end': p.get('saturday_end', ''),
            'holiday_start': p.get('holiday_start', ''),
            'holiday_end': p.get('holiday_end', ''),
            'fee': p.get('fee', ''),
            'base_minutes': p.get('base_minutes', ''),
            'base_fee': p.get('base_fee', ''),
            'extra_unit_minutes': p.get('extra_unit_minutes', ''),
            'extra_unit_fee': p.get('extra_unit_fee', ''),
            'day_pass_hours': p.get('day_pass_hours', ''),
            'day_pass_fee': p.get('day_pass_fee', ''),
            'monthly_fee': p.get('monthly_fee', ''),
            'phone': p.get('phone', ''),
            'lat': p['lat'],
            'lng': p['lng'],
            'disabled_space': p.get('disabled_space', ''),
        }
        for p in parking_list
    ]


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

