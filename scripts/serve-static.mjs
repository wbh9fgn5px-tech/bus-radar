// Sert le build statique (out/) comme Netlify : /carte → carte.html.
//   npm run preview:static   (après npm run build:static)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("out");
const port = Number(process.env.PORT || 4000);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png", ".woff2": "font/woff2",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    const candidates = [url, `${url}.html`, path.join(url, "index.html")];
    for (const c of candidates) {
      const file = path.join(root, c);
      if (!file.startsWith(root)) break;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
        return fs.createReadStream(file).pipe(res);
      }
    }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(path.join(root, "404.html")).pipe(res);
  })
  .listen(port, () => console.log(`Build statique servi sur http://localhost:${port}`));
