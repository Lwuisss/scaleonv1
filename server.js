'use strict';

const path = require('path');
const express = require('express');
const app = require('./api/index');

const PORT = process.env.PORT || 3000;

// Serve static assets from public/ directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// Fallback for HTML5 client routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`✦ Scaleon Sunucusu Başlatıldı: http://localhost:${PORT}`);
  console.log(`✦ Ortam: ${process.env.NODE_ENV || 'development'}`);
  console.log(`===============================================`);
});
