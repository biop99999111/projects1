        function renderReportListPanel() {
            var nav = document.getElementById('nav-content');
            if (currentMenu !== 'report-list') return;
            var html = '<div class="nav-title" style="color:#1976d2;">📋 신고목록</div>';
            html += '<div class="nav-section"><ul class="parking-list" id="report-list-ul"></ul></div>';
            html += '<div id="nav-report-detail"></div>';
            nav.innerHTML = html;
            function loadList() {
                fetch('/api/reports/').then(function(res) { return res.json(); }).then(function(data) {
                    var list = document.getElementById('report-list-ul');
                    if (!list) return;
                    var reports = data.reports || [];
                    if (reports.length === 0) {
                        list.innerHTML = '<li class="empty-state">등록된 신고가 없습니다.</li>';
                        return;
                    }
                    list.innerHTML = '';
                    reports.forEach(function(r) {
                        var li = document.createElement('li');
                        li.className = 'report-list-item';
                        li.setAttribute('data-id', r.id);
                        li.textContent = (r.vehicle_number || '') + ' - ' + (r.created_at ? r.created_at.slice(0, 19).replace('T', ' ') : '');
                        list.appendChild(li);
                    });
                    list.querySelectorAll('.report-list-item').forEach(function(li) {
                        li.addEventListener('click', function() {
                            var id = parseInt(this.getAttribute('data-id'), 10);
                            if (isNaN(id)) return;
                            fetch('/api/reports/' + id + '/').then(function(res) { return res.json(); }).then(function(r) {
                                var detailEl = document.getElementById('nav-report-detail');
                                if (!detailEl) return;
                                // 지도에는 해당 신고의 위도·경도 마커만 표시 (다른 마커는 모두 제거)
                                showOnlyReportLocationMarker(r.lat, r.lng);
                                var h = '<div class="detail-card">';
                                h += '<div class="detail-head">신고 상세정보</div>';
                                h += '<div class="detail-row"><span class="label">차량번호</span><span class="value">' + esc(r.vehicle_number || '') + '</span></div>';
                                h += '<div class="detail-row"><span class="label">위치</span><span class="value">' + esc(r.lat + ', ' + r.lng) + '</span></div>';
                                h += '<div class="detail-row"><span class="label">신고내용</span><span class="value wrap">' + esc(r.content || '-') + '</span></div>';
                                h += '<div class="detail-row"><span class="label">등록일시</span><span class="value">' + esc(r.created_at ? r.created_at.slice(0, 19).replace('T', ' ') : '') + '</span></div>';
                                h += '<div class="delete-password-row"><input type="password" id="report-delete-password" placeholder="비밀번호 입력">';
                                h += '<button type="button" class="btn btn-danger" id="report-delete-btn" data-id="' + r.id + '">삭제</button></div>';
                                h += '</div>';
                                detailEl.innerHTML = h;
                                document.getElementById('report-delete-btn').addEventListener('click', function() {
                                    var pw = document.getElementById('report-delete-password').value || '';
                                    var rid = parseInt(this.getAttribute('data-id'), 10);
                                    if (!pw) { alert('비밀번호를 입력하세요.'); return; }
                                    fetch('/api/reports/' + rid + '/delete/', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ password: pw })
                                    }).then(function(res) { return res.json(); }).then(function(data) {
                                        if (data.error) { alert(data.error); return; }
                                        clearSelectedReportMarker();
                                        detailEl.innerHTML = '';
                                        loadList();
                                    }).catch(function() { alert('삭제 요청에 실패했습니다.'); });
                                });
                            });
                        });
                    });
                }).catch(function() {
                    var list = document.getElementById('report-list-ul');
                    if (list) list.innerHTML = '<li class="empty-state">목록을 불러오지 못했습니다.</li>';
                });
            }
            loadList();
        }