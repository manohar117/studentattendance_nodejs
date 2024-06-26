const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const querystring = require('querystring');
const ejs = require('ejs');

// MySQL Connection
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'date_picker_db'
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL database: ' + err.stack);
    return;
  }
  console.log('Connected to MySQL database as id ' + connection.threadId);
});

// Helper function to serve static files
const serveStaticFile = (res, filePath, contentType, responseCode = 200) => {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 - Internal Error');
    } else {
      res.writeHead(responseCode, { 'Content-Type': contentType });
      res.end(data);
    }
  });
};

// Helper function to render EJS templates
const renderTemplate = (res, filePath, data) => {
  fs.readFile(filePath, 'utf-8', (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 - Internal Error');
    } else {
      const compiled = ejs.compile(content);
      const rendered = compiled(data);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(rendered);
    }
  });
};

// Start the HTTP server
http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  if (req.method === 'GET' && pathname === '/') {
    serveStaticFile(res, './views/index.html', 'text/html');
  } else if (req.method === 'GET' && pathname === '/styles.css') {
    serveStaticFile(res, './public/styles.css', 'text/css');
  } else if (req.method === 'POST' && pathname === '/fetch-students') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const postData = querystring.parse(body);
      const selectedDate = postData.date;

      // Get today's date
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set hours, minutes, seconds, and milliseconds to zero for accurate comparison

      // Parse the selected date from the input
      const inputDate = new Date(selectedDate);

      // Compare the selected date with today's date
      if (inputDate > today) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Error: Selected date cannot be greater than today.');
        return;
      }

      // Check if attendance data for the selected date already exists
      const queryCheck = 'SELECT sa.student_id, s.name, sa.status FROM student_attendance sa JOIN students s ON sa.student_id = s.id WHERE sa.date = ?';
      connection.query(queryCheck, [selectedDate], (err, results) => {
        if (err) {
          console.error('Error fetching data: ' + err);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Server Error');
          return;
        }

        if (results.length > 0) {
          // Attendance data already exists for the selected date
          renderTemplate(res, './views/attendance_view.ejs', { attendanceData: results, date: selectedDate });
        } else {
          // Fetch students for the new attendance entry
          const query = 'SELECT * FROM students';
          connection.query(query, (err, results) => {
            if (err) {
              console.error('Error fetching data: ' + err);
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Server Error');
              return;
            }
            renderTemplate(res, './views/attendance.ejs', { students: results, date: selectedDate });
          });
        }
      });
    });
  } else if (req.method === 'POST' && pathname === '/submit-data') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const postData = querystring.parse(body);
      const date = postData.date;
      const statusData = [];

      for (const key in postData) {
        if (key.startsWith('status_')) {
          const studentId = key.split('_')[1];
          const status = postData[key];
          statusData.push([studentId, date, status]);
        }
      }

      const query = 'INSERT INTO student_attendance (student_id, date, status) VALUES ?';
      connection.query(query, [statusData], (err, result) => {
        if (err) {
          console.error('Error inserting data: ' + err);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Server Error');
          return;
        }
        // Fetch attendance data for the selected date after marking attendance
        const queryFetch = 'SELECT sa.student_id, s.name, sa.status FROM student_attendance sa JOIN students s ON sa.student_id = s.id WHERE sa.date = ?';
        connection.query(queryFetch, [date], (err, results) => {
          if (err) {
            console.error('Error fetching data: ' + err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Server Error');
            return;
          }
          renderTemplate(res, './views/attendance_view.ejs', { attendanceData: results, date: date });
        });
      });
    });
  } else if (req.method === 'GET' && pathname === '/attendance-report') {
    const query = `
      SELECT s.name, 
             COUNT(CASE WHEN sa.status = 'present' THEN 1 END) AS daysPresent,
             COUNT(*) AS totalMarkedDays,
             ROUND((COUNT(CASE WHEN sa.status = 'present' THEN 1 END) / COUNT(*)) * 100, 2) AS attendancePercentage
      FROM student_attendance sa
      JOIN students s ON sa.student_id = s.id
      GROUP BY s.name
    `;
    connection.query(query, (err, results) => {
      if (err) {
        console.error('Error fetching data: ' + err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error');
        return;
      }
      renderTemplate(res, './views/attendance_report.ejs', { reportData: results });
    });
  } else {
    // Serve static files (including images)
    const extname = String(path.extname(pathname)).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.woff': 'application/font-woff',
      '.ttf': 'application/font-ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.otf': 'application/font-otf',
      '.wasm': 'application/wasm'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(`./public${pathname}`, (error, content) => {
      if (error) {
        if (error.code == 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 - Not Found');
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('500 - Internal Server Error');
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  }
}).listen(3000, () => {
  console.log('Server running on port 3000');
});
