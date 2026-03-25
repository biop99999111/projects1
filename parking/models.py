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
