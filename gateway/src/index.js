const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gateway' });
});

app.listen(PORT, () => {
  console.log(`Gateway running on :${PORT}`);
});
