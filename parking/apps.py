from django.apps import AppConfig


class ParkingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'parking'
    verbose_name = '주차 단속 알림'
