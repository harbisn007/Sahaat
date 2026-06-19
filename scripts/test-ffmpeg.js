const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');
console.log('FFMPEG PATH:', ffmpegPath);
execFile(ffmpegPath, ['-version'], (err, stdout) => {
  if (err) console.error('❌ FFMPEG FAILED:', err.message);
  else console.log('✅ FFMPEG OK:', stdout.split('\n')[0]);
});
