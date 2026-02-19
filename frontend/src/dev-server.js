import http from "node:http";

const port = Number(process.env.PORT || 5173);

const html = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>KitchenSync Frontend</title></head>
  <body>
    <h1>KitchenSync Frontend</h1>
    <p>Minimal dev UI skeleton.</p>
  </body>
</html>`;

http
  .createServer((_, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  })
  .listen(port, () => {
    console.log(`frontend listening on http://localhost:${port}`);
  });
