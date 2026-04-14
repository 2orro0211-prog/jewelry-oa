async function askAi() {
  const promptEl = document.getElementById('aiPrompt');
  const answerEl = document.getElementById('aiAnswer');
  const prompt = promptEl.value.trim();
  if (!prompt) return;
  answerEl.textContent = '处理中...';

  const res = await apiFetch('/api/ai/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  answerEl.textContent = data.answer || '无结果';
}

if (requireAuth()) {
  document.getElementById('btnAi').addEventListener('click', askAi);
}
