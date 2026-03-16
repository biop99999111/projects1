from django.urls import path
from . import views

urlpatterns = [
    path('', views.map_view, name='map'),
    path('api/check-location/', views.api_check_location, name='api_check_location'),
    path('api/route/', views.api_route, name='api_route'),
]
