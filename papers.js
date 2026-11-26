(function (global) {
  'use strict';

  const papers = global.PAPER_EXAMS || [];
  const scoresLimit = 150;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function prettyDate(value) {
    if (!value) return '';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[1] + '/' + Number(match[2]) + '/' + Number(match[3]) : '';
  }

  function dateForAttempt(attempt) {
    return attempt && (attempt.finishedOn || attempt.startedOn) || '';
  }

  function renderText(parent, text) {
    const lines = String(text == null ? '' : text).split('\n');
    lines.forEach((line, lineIndex) => {
      if (lineIndex) parent.appendChild(document.createElement('br'));
      const displayMath = line.match(/^\s*\$([^$]+)\$\s*$/);
      if (displayMath && global.katex) {
        const block = document.createElement('div');
        block.className = 'paper-math';
        try {
          block.innerHTML = global.katex.renderToString(displayMath[1], {
            displayMode: true,
            throwOnError: false
          });
          parent.appendChild(block);
          return;
        } catch (_) {}
      }
      const pieces = line.split(/(\$[^$]+\$)/g);
      pieces.forEach(piece => {
        if (piece.startsWith('$') && piece.endsWith('$') && global.katex) {
          try {
            const span = document.createElement('span');
            span.innerHTML = global.katex.renderToString(piece.slice(1, -1), {
              displayMode: false,
              throwOnError: false
            });
            parent.appendChild(span);
            return;
          } catch (_) {}
        }
        parent.appendChild(document.createTextNode(piece));
      });
    });
  }

  function answersMarkup(question) {
    return '<div class="paper-answer" data-paper-answer="' + question.number + '">' +
      '<h4>参考答案</h4><div class="paper-answer-text"></div>' +
      '<h4>训练评分点</h4><ul class="paper-rubric">' +
      question.marks.map(mark =>
        '<li><strong>' + mark.points + ' 分</strong> · ' + escapeHtml(mark.text) + '</li>'
      ).join('') + '</ul></div>';
  }

  function renderQuestions(paper, revealed) {
    return paper.sections.map(section =>
      '<section class="paper-section"><h3>' + escapeHtml(section.title) + '</h3>' +
      section.questions.map(question => {
        let table = '';
        if (question.table) {
          table = '<div class="paper-table-wrap"><table class="paper-table"><thead><tr>' +
            question.table.headers.map(cell => '<th>' + escapeHtml(cell) + '</th>').join('') +
            '</tr></thead><tbody>' + question.table.rows.map(row =>
              '<tr>' + row.map(cell => '<td>' + escapeHtml(cell) + '</td>').join('') + '</tr>'
            ).join('') + '</tbody></table></div>';
        }
        const subparts = question.subparts && question.subparts.length
          ? '<ol class="paper-subparts">' + question.subparts.map((part, index) =>
              '<li data-subpart="' + question.number + '-' + index + '"></li>'
            ).join('') + '</ol>'
          : '';
        return '<article class="paper-question"><div class="paper-q-head"><strong>' +
          question.number + '.</strong><span>' + question.max + ' 分</span></div>' +
          '<div class="paper-question-prompt" data-prompt="' + question.number + '"></div>' +
          subparts + table + (revealed ? answersMarkup(question) : '') + '</article>';
      }).join('') + '</section>'
    ).join('');
  }

  function latestFirst(attempts) {
    return attempts.slice().sort((left, right) =>
      (right.updatedAt || right.startedAt || 0) - (left.updatedAt || left.startedAt || 0)
    );
  }

  function open(view, services) {
    let currentPaper = null;
    let currentAttempt = null;
    let answersVisible = false;

    function list() {
      currentPaper = null;
      currentAttempt = null;
      answersVisible = false;
      const completed = papers.reduce((count, paper) =>
        count + services.list(paper.id).filter(attempt => attempt.score != null).length, 0
      );
      view.innerHTML = '<div class="card paper-intro"><h2>891 模拟卷</h2>' +
        '<p>共 10 套，每套 150 分，建议限时 180 分钟。可在纸上作答，完成后再展开答案和评分点。</p>' +
        '<p class="mut">训练评分点供自评使用，不是南京大学公布的标准答案。</p>' +
        '<div class="paper-progress">已记录 ' + completed + ' 次成绩</div></div>' +
        '<div class="paper-list">' + papers.map(paper => {
          const attempts = latestFirst(services.list(paper.id));
          const latest = attempts[0];
          const summary = !latest
            ? '尚未开始'
            : latest.score == null
              ? '进行中 · ' + prettyDate(latest.startedOn)
              : prettyDate(dateForAttempt(latest)) + ' · ' + latest.score + ' / ' + paper.total + ' 分';
          return '<article class="card paper-list-card"><div class="paper-list-head">' +
            '<div><h3>第 ' + paper.id + ' 套</h3><div class="mut">' +
            prettyDate(paper.date) + ' · 150 分 · 180 分钟</div></div>' +
            '<div class="paper-status">' + escapeHtml(summary) + '</div></div>' +
            '<div class="paper-list-actions"><button class="btn pri" type="button" data-paper-open="' +
            paper.id + '">' + (latest && latest.score == null ? '继续作答' : latest ? '查看成绩与答案' : '开始作答') +
            '</button>' + (latest ? '<button class="btn" type="button" data-paper-new="' +
              paper.id + '">新做一次</button>' : '') + '</div>' +
            (attempts.length > 1 ? '<div class="paper-history">历史记录 ' +
              attempts.slice(1, 4).map(attempt => attempt.score == null
                ? prettyDate(attempt.startedOn) + ' 进行中'
                : prettyDate(dateForAttempt(attempt)) + ' ' + attempt.score + ' 分'
              ).join(' · ') + '</div>' : '') + '</article>';
        }).join('') + '</div>';
      view.querySelectorAll('[data-paper-open]').forEach(button => {
        button.addEventListener('click', () => openLatest(button.dataset.paperOpen));
      });
      view.querySelectorAll('[data-paper-new]').forEach(button => {
        button.addEventListener('click', () => start(button.dataset.paperNew));
      });
      window.scrollTo(0, 0);
    }

    function openLatest(id) {
      const attempts = latestFirst(services.list(id));
      const attempt = attempts[0];
      if (!attempt) return start(id);
      show(id, attempt);
    }

    function start(id) {
      const attempt = services.start(id);
      if (!attempt) {
        const notice = view.querySelector('[data-paper-open="' + id + '"]');
        if (notice) notice.insertAdjacentHTML('afterend',
          '<div class="mut paper-storage-error">无法保存作答进度，请检查浏览器存储空间。</div>');
        return;
      }
      show(id, attempt);
    }

    function show(id, attempt) {
      currentPaper = papers.find(paper => paper.id === id);
      currentAttempt = attempt;
      answersVisible = false;
      if (!currentPaper) return list();
      const saved = attempt.score;
      const draft = attempt.draftScore;
      view.innerHTML = '<div class="card paper-toolbar"><div><h2>第 ' +
        currentPaper.id + ' 套</h2><div class="mut">' + prettyDate(currentPaper.date) +
        ' · 建议限时 180 分钟 · 满分 150</div></div>' +
        '<button class="btn small" id="paperBack" type="button">返回卷目</button></div>' +
        '<div class="card paper-note">先独立完成试题。准备好批改时，再点“对答案并自评”。</div>' +
        '<div id="paperQuestions">' + renderQuestions(currentPaper, false) + '</div>' +
        '<div class="card paper-grade" id="paperGrade">' +
        '<button class="btn pri" id="paperReveal" type="button">对答案并自评</button>' +
        '<div class="paper-grade-entry hide" id="paperGradeEntry"><label for="paperScore">本次总分</label>' +
        '<div class="paper-score-row"><input id="paperScore" type="number" min="0" max="150" step="0.5" ' +
        (saved != null ? 'value="' + saved + '"' : draft != null ? 'value="' + draft + '"' : '') +
        ' inputmode="decimal" aria-describedby="paperScoreHint"><span> / 150 分</span></div>' +
        '<div class="mut" id="paperScoreHint">可以先在纸上按各题评分点合计，再记录本次总分。</div>' +
        '<button class="btn pri" id="paperSaveScore" type="button">' +
        (saved != null ? '更新本次成绩' : '记录本次成绩') + '</button><div id="paperSavedNotice" aria-live="polite"></div>' +
        '</div></div>';
      fillMath(view);
      document.getElementById('paperBack').onclick = list;
      document.getElementById('paperReveal').onclick = reveal;
      window.scrollTo(0, 0);
    }

    function fillMath(root) {
      const questions = currentPaper.sections.flatMap(section => section.questions);
      root.querySelectorAll('[data-prompt]').forEach(element => {
        const question = questions.find(item => String(item.number) === element.dataset.prompt);
        if (question) renderText(element, question.prompt);
      });
      root.querySelectorAll('[data-subpart]').forEach(element => {
        const match = element.dataset.subpart.match(/^(\d+)-(\d+)$/);
        const question = match && questions.find(item => item.number === Number(match[1]));
        const part = question && question.subparts && question.subparts[Number(match[2])];
        if (part) renderText(element, part);
      });
    }

    function reveal() {
      if (answersVisible) return;
      answersVisible = true;
      const questions = document.getElementById('paperQuestions');
      questions.innerHTML = renderQuestions(currentPaper, true);
      fillMath(questions);
      questions.querySelectorAll('[data-paper-answer]').forEach(element => {
        const number = Number(element.dataset.paperAnswer);
        const question = currentPaper.sections.flatMap(section => section.questions)
          .find(item => item.number === number);
        if (question) renderText(element.querySelector('.paper-answer-text'), question.answer);
      });
      document.getElementById('paperReveal').hidden = true;
      document.getElementById('paperGradeEntry').classList.remove('hide');
      const input = document.getElementById('paperScore');
      input.addEventListener('input', () => {
        if (!input.value) {
          services.draft(currentPaper.id, currentAttempt.id, null);
          return;
        }
        const score = Number(input.value);
        if (Number.isFinite(score) && score >= 0 && score <= scoresLimit) {
          services.draft(currentPaper.id, currentAttempt.id, score);
        }
      });
      document.getElementById('paperSaveScore').onclick = saveScore;
      document.getElementById('paperGrade').scrollIntoView({block: 'center'});
    }

    function saveScore() {
      const input = document.getElementById('paperScore');
      if (input.value === '') {
        input.focus();
        document.getElementById('paperSavedNotice').textContent = '先输入本次总分。';
        return;
      }
      const score = Number(input.value);
      if (!Number.isFinite(score) || score < 0 || score > currentPaper.total) {
        input.focus();
        document.getElementById('paperSavedNotice').textContent = '分数需在 0 到 150 之间。';
        return;
      }
      if (services.record(currentPaper.id, currentAttempt.id, score)) {
        currentAttempt = services.list(currentPaper.id).find(item => item.id === currentAttempt.id);
        const notice = document.getElementById('paperSavedNotice');
        notice.className = 'paper-save-success';
        notice.textContent = '已记录 ' + score + ' / 150 分，' +
          prettyDate(currentAttempt.finishedOn) + '。';
        document.getElementById('paperSaveScore').textContent = '更新本次成绩';
      } else {
        document.getElementById('paperSavedNotice').textContent =
          '保存失败，分数还在输入框里。检查浏览器存储后重试。';
      }
    }

    list();
  }

  global.PaperPractice = {open: open};
})(window);
