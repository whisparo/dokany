fetch('https://www.dokany.workers.dev/api/telegram/webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    update_id: 999999,
    message: { text: 'test' },
  }),
})
  .then((res) => res.json())
  .then((data) => console.log('Response:', data))
  .catch((err) => console.error('Error:', err));