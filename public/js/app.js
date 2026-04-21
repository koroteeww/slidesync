// slidesync public JS
(function(){
  // 1. Participant ID management
  function getParticipantId(){
    try{
      const key = 'slidesync_pid';
      let id = localStorage.getItem(key);
      if(!id){
        if(window.crypto && crypto.randomUUID){
          id = crypto.randomUUID();
        } else {
          // fallback: simple random string
          id = 'pid-' + Math.random().toString(36).slice(2, 10);
        }
        localStorage.setItem(key, id);
      }
      return id;
    }catch(e){
      return '';
    }
  }

  // expose globally
  window.getParticipantId = getParticipantId;

  // Helpers
  function safeJson(res){ return res.json().catch(()=>null); }

  // Grab SESSION vars if present
  var SESSION_ID = typeof window.SESSION_ID !== 'undefined' ? window.SESSION_ID : (window.SESSION_ID = (function(){ try{ return document.querySelector('script[data-session-id]')?.getAttribute('data-session-id') }catch(e){return undefined}})());
  // But our EJS injects const SESSION_ID and SESSION_TYPE inline, so also check window
  if(typeof SESSION_ID === 'undefined' && typeof SESSION_ID_GLOBAL !== 'undefined') SESSION_ID = SESSION_ID_GLOBAL;
  var SESSION_TYPE = typeof window.SESSION_TYPE !== 'undefined' ? window.SESSION_TYPE : (window.SESSION_TYPE = (function(){ try{ return document.querySelector('script[data-session-type]')?.getAttribute('data-session-type') }catch(e){return undefined}})());

  // Internal polling handle
  var pollHandle = null;

  async function fetchResults(){
    if(!SESSION_ID) return null;
    try{
      const res = await fetch('/api/results/' + SESSION_ID, { cache: 'no-store' });
      if(!res.ok) return null;
      return await res.json();
    }catch(e){
      return null;
    }
  }

  // 3. renderResults
  function renderResults(data){
    if(!data) return;
    // Update total responses
    const totalEl = document.getElementById('total-responses');
    if(totalEl && typeof data.totalResponses !== 'undefined'){
      totalEl.textContent = String(data.totalResponses);
    }

    if(SESSION_TYPE === 'wordcloud'){
      // data.words expected: [{text, count}]
      if(!Array.isArray(data.words)) return;
      const canvas = document.getElementById('wc');
      if(!canvas || typeof WordCloud === 'undefined') return;
      // clear
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width, canvas.height);
      const list = data.words.map(w=>[w.text, w.count]);
      WordCloud(canvas, { list, gridSize: Math.round(16 * canvas.width / 1024), weightFactor: function(size){ return Math.max(10, size*2); }, rotateRatio:0.5 });
    } else if(SESSION_TYPE === 'quiz' || SESSION_TYPE === 'poll'){
      if(!Array.isArray(data.questions)) return;
      // For each question, update bar elements. The results view renders .question-result[data-question-index="N"]
      data.questions.forEach(function(q, qIndex){
        var qEl = document.querySelector('.question-result[data-question-index="' + qIndex + '"]');
        if(!qEl) return;
        var bars = qEl.querySelectorAll('.bar');
        q.options.forEach(function(opt, idx){
          var bar = bars[idx] || qEl.querySelector('.bar[data-option-index="' + idx + '"]');
          if(bar){
            var width = typeof opt.percentage !== 'undefined' ? opt.percentage : (opt.count && data.totalResponses ? Math.round(opt.count / data.totalResponses * 100) : 0);
            bar.style.width = (width) + '%';
            var countEl = bar.querySelector('.bar-value');
            if(countEl) countEl.textContent = opt.count + ' (' + (width) + '%)';
          }
        });
      });
    }
  }

  // 2. Polling loop
  async function startPolling(){
    if(!SESSION_ID) return;
    // first fetch
    var data = await fetchResults();
    renderResults(data);
    if(!data) return;
    if(data.status === 'closed') return; // do not start
    pollHandle = setInterval(async function(){
      const d = await fetchResults();
      if(!d) return;
      renderResults(d);
      if(d.status === 'closed'){
        clearInterval(pollHandle);
        pollHandle = null;
      }
    }, 500);
  }

  // 4. Quiz/Poll submit handler
  function attachFormHandler(){
    // For quiz
    var quizForm = document.getElementById('quizForm') || document.getElementById('quiz-form');
    if(quizForm){
      quizForm.addEventListener('submit', function(e){ e.preventDefault(); });
      var submitBtn = document.getElementById('submitBtn');
      if(submitBtn){
        submitBtn.addEventListener('click', async function(){
          submitBtn.disabled = true;
          var form = quizForm;
          var inputs = form.querySelectorAll('input[type=radio]:checked');
          var answers = {};
          inputs.forEach(function(i){
            var m = i.name.match(/answers\[(\d+)\]/) || i.name.match(/q_(\d+)/);
            if(m) answers[m[1]] = Number(i.value);
          });
          try{
            const res = await fetch('/s/' + SESSION_ID + '/submit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ participantId: getParticipantId(), answers }) });
            if(res.status === 409){ alert(typeof window.t === 'function' ? t('participate.alreadyVoted') : 'You have already submitted'); submitBtn.disabled=false; return; }
            if(res.status === 410){ alert(typeof window.t === 'function' ? t('participate.sessionClosed') : 'Session is closed'); submitBtn.disabled=false; return; }
            const json = await safeJson(res);
            if(res.ok){
              var formWrap = document.getElementById('quizForm') || document.getElementById('quiz-form'); if(formWrap) formWrap.style.display='none';
              var thanks = document.getElementById('thankyou'); if(thanks) thanks.style.display='block';
              // show score if correct answers available in page
              try{
                if(typeof window.SESSION_CONFIG !== 'undefined'){
                  var cfg = window.SESSION_CONFIG;
                  var correct=0, total = cfg.questions.length;
                  cfg.questions.forEach(function(q){ if(typeof q.correct === 'number' && answers[q.id] === q.correct) correct++; });
                  var scoreEl = document.getElementById('score'); if(scoreEl){ scoreEl.textContent = correct + ' out of ' + total; scoreEl.style.display='block'; }
                }
              }catch(e){/*ignore*/}
            } else {
              alert((json && json.error) || 'Submit failed'); submitBtn.disabled=false;
            }
          }catch(err){ console.error(err); alert('Submission error'); submitBtn.disabled=false; }
        });
      }
    }

    // For poll (same handler)
    var pollForm = document.getElementById('pollForm');
    if(pollForm){
      var pollBtn = document.getElementById('submitBtn');
      if(pollBtn){
        pollBtn.addEventListener('click', async function(){
          pollBtn.disabled = true;
          var form = pollForm;
          var inputs = form.querySelectorAll('input[type=radio]:checked');
          var answers = {};
          inputs.forEach(function(i){
            var m = i.name.match(/answers\[(\d+)\]/) || i.name.match(/q_(\d+)/);
            if(m) answers[m[1]] = Number(i.value);
          });
          try{
            const res = await fetch('/s/' + SESSION_ID + '/submit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ participantId: getParticipantId(), answers }) });
            if(res.status === 409){ alert(typeof window.t === 'function' ? t('participate.alreadyVoted') : 'You have already submitted'); pollBtn.disabled=false; return; }
            if(res.status === 410){ alert(typeof window.t === 'function' ? t('participate.sessionClosed') : 'Session is closed'); pollBtn.disabled=false; return; }
            const json = await safeJson(res);
            if(res.ok){
              if(form) form.style.display='none';
              var thanks = document.getElementById('thankyou'); if(thanks) thanks.style.display='block';
            } else { alert((json && json.error) || 'Submit failed'); pollBtn.disabled=false; }
          }catch(err){ console.error(err); alert('Submission error'); pollBtn.disabled=false; }
        });
      }
    }

    // 5. Word cloud submit handler
    var wcForm = document.getElementById('wordcloudForm');
    if(wcForm){
      var wcBtn = document.getElementById('submitBtn');
      if(wcBtn){
        wcBtn.addEventListener('click', async function(){
          wcBtn.disabled = true;
          var word = (document.getElementById('word') || {}).value || '';
          word = word.trim();
          try{
            const res = await fetch('/s/' + SESSION_ID + '/submit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ participantId: getParticipantId(), word }) });
            if(res.status === 409){ alert(typeof window.t === 'function' ? t('participate.alreadyVoted') : 'You have already submitted'); wcBtn.disabled=false; return; }
            if(res.status === 410){ alert(typeof window.t === 'function' ? t('participate.sessionClosed') : 'Session is closed'); wcBtn.disabled=false; return; }
            const json = await safeJson(res);
            if(res.ok){
              if(wcForm) wcForm.style.display='none';
              var thanks = document.getElementById('thankyou'); if(thanks) thanks.style.display='block';
            } else { alert((json && json.error) || 'Submit failed'); wcBtn.disabled=false; }
          }catch(err){ console.error(err); alert('Submission error'); wcBtn.disabled=false; }
        });
      }
    }
  }

  // Attach on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function(){
    // Expose SESSION_CONFIG if present as var in page
    try{
      if(typeof SESSION_CONFIG !== 'undefined') window.SESSION_CONFIG = SESSION_CONFIG;
    }catch(e){}

    // try to read simple injected constants (some templates define them inline)
    try{ if(typeof SESSION_ID === 'undefined' && typeof window.SESSION_ID !== 'undefined') SESSION_ID = window.SESSION_ID; }catch(e){}
    try{ if(typeof SESSION_TYPE === 'undefined' && typeof window.SESSION_TYPE !== 'undefined') SESSION_TYPE = window.SESSION_TYPE; }catch(e){}

    attachFormHandler();
    if(SESSION_ID){ startPolling(); }
  });

})();
