from django.urls import path
from . import views

urlpatterns = [
    path('', views.map_view, name='map'),
    path('api/check-location/', views.api_check_location, name='api_check_location'),
    path('api/route/', views.api_route, name='api_route'),
    path('api/parking-list/', views.api_parking_list, name='api_parking_list'),
    path('api/search-parking/', views.api_search_parking_kakao, name='api_search_parking'),
    path('api/reports/', views.api_report_list, name='api_report_list'),
    path('api/reports/create/', views.api_report_create, name='api_report_create'),
    path('api/reports/<int:report_id>/', views.api_report_detail, name='api_report_detail'),
    path('api/reports/<int:report_id>/delete/', views.api_report_delete, name='api_report_delete'),
]