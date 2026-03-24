from django.db import models
from django.contrib.auth.hashers import make_password, check_password


class Report(models.Model):
    """신고하기에서 제출된 신고 건."""
    vehicle_number = models.CharField(max_length=20)
    lat = models.FloatField()
    lng = models.FloatField()
    content = models.TextField(blank=True)
    password_hash = models.CharField(max_length=128)  # Django hasher 출력
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def set_password(self, raw_password):
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password_hash)


from django.db import models

class Payment(models.Model):
    order_id = models.CharField(max_length=50, unique=True)  # 주문 번호
    amount = models.DecimalField(max_digits=10, decimal_places=2)  # 결제 금액
    status = models.CharField(max_length=20)  # 결제 상태: ready, paid, failed 등
    method = models.CharField(max_length=20)  # 결제 수단: kakao, card 등
    created_at = models.DateTimeField(auto_now_add=True)  # 레코드 생성 시각
    updated_at = models.DateTimeField(auto_now=True)      # 레코드 수정 시각

    def __str__(self):
        return f"{self.order_id} - {self.status}"
