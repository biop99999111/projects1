        function renderRouteGuidePanel() {
            var nav = document.getElementById('nav-content');
            if (currentMenu !== 'route') return;
            var html = '<div class="nav-title" style="color:#1976d2;">🕒 실시간 예상 시간</div>';
            if (!lastRouteParking) {
                html += '<div class="empty-state">주차장을 선택하면 실시간 이동 예상시간이 여기에 표시됩니다!!</div>';
            } else {
                html += '<div class="detail-card">';
                html += '<div class="detail-head">' + (lastRouteParking.name || '공영주차장') + '</div>';
                if (lastRouteParking.distance_km != null && lastRouteParking.distance_km !== undefined) {
                    html += '<div class="detail-row"><span class="label">거리</span><span class="value">' + lastRouteParking.distance_km + ' km</span></div>';
                }
                if (lastRouteDurationSeconds != null && lastRouteDurationSeconds > 0) {
                    var min = Math.round(lastRouteDurationSeconds / 60);
                    html += '<div class="detail-row"><span class="label">실시간 이동 예상시간</span><span class="value"><strong>약 ' + min + '분</strong></span></div>';
                } else {
                    html += '<div class="detail-row"><span class="label">경로</span><span class="value">직선 경로 표시</span></div>';
                }
                html += '</div>';
            }
            nav.innerHTML = html;