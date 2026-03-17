import sys
import threading

from django.apps import AppConfig


def _warm_api_caches():
    """CCTV·공영주차장 API를 동시에 호출해 워밍 시간을 단축 (순차 대비 약 절반)."""
    from .data_loader import get_cctv_rows, get_parking_rows
    err_cctv = []
    err_parking = []

    def do_cctv():
        try:
            get_cctv_rows()
        except Exception as e:
            err_cctv.append(e)

    def do_parking():
        try:
            get_parking_rows()
        except Exception as e:
            err_parking.append(e)

    t1 = threading.Thread(target=do_cctv, daemon=True)
    t2 = threading.Thread(target=do_parking, daemon=True)
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    if err_cctv or err_parking:
        raise (err_cctv[0] if err_cctv else err_parking[0])


class ParkingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'parking'
    verbose_name = '주차 단속 알림'

    def ready(self):
        if 'runserver' not in sys.argv:
            return
        print("API 캐시 로딩 중... (병렬 호출로 대기 시간 단축, 완료 후 서버가 뜹니다)")
        try:
            _warm_api_caches()
        except Exception:
            print("API 캐시 로딩 실패. 서버는 기동합니다. 첫 클릭 시 지연될 수 있습니다.")
