        function renderReportPanel() {
            var nav = document.getElementById('nav-content');
            if (currentMenu !== 'report') return;
            var locText = (placeMarkerLat != null && placeMarkerLng != null)
                ? ('위도 ' + placeMarkerLat.toFixed(6) + ', 경도 ' + placeMarkerLng.toFixed(6))
                : '지도를 클릭하여 위치를 설정하세요.';
            var html = '<div class="nav-title" style="color:#1976d2;">📋 신고하기</div>';
            html += '<div class="form-group"><label>차량번호</label><input type="text" id="report-vehicle" placeholder="예: 12가 3456" maxlength="20"></div>';
            html += '<div class="form-group"><label>마커에 위치</label><div class="value" id="report-location">' + esc(locText) + '</div></div>';
            html += '<div class="form-group"><label>신고내용</label><textarea id="report-content" placeholder="신고 내용을 입력하세요."></textarea></div>';
            html += '<div class="form-group"><label>비밀번호</label><input type="password" id="report-password" placeholder="삭제 시 사용"></div>';
            html += '<div class="form-actions">';
            html += '<button type="button" class="btn btn-primary" id="report-submit">신고하기</button>';
            html += '<button type="button" class="btn btn-secondary" id="report-reset">재작성</button>';
            html += '</div>';
            nav.innerHTML = html;
            document.getElementById('report-submit').addEventListener('click', function() {
                var vehicle = (document.getElementById('report-vehicle').value || '').trim();
                var content = (document.getElementById('report-content').value || '').trim();
                var password = document.getElementById('report-password').value || '';
                if (placeMarkerLat == null || placeMarkerLng == null) {
                    alert('지도를 클릭하여 신고 위치를 먼저 설정하세요.');
                    return;
                }
                if (!vehicle) {
                    alert('차량번호를 입력하세요.');
                    return;
                }
                if (!password) {
                    alert('비밀번호를 입력하세요. (삭제 시 사용됩니다.)');
                    return;
                }
                fetch('/api/reports/create/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vehicle_number: vehicle,
                        lat: placeMarkerLat,
                        lng: placeMarkerLng,
                        content: content,
                        password: password
                    })
                }).then(function(res) { return res.json(); }).then(function(data) {
                    if (data.error) { alert(data.error); return; }
                    alert('신고가 접수되었습니다.');
                    document.getElementById('report-vehicle').value = '';
                    document.getElementById('report-content').value = '';
                    document.getElementById('report-password').value = '';
                }).catch(function() { alert('신고 접수에 실패했습니다.'); });
            });
            document.getElementById('report-reset').addEventListener('click', function() {
                document.getElementById('report-vehicle').value = '';
                document.getElementById('report-content').value = '';
                document.getElementById('report-password').value = '';
            });
        }