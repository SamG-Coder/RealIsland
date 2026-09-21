import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(process.env.SERVE_ROOT||fileURLToPath(new URL('../',import.meta.url)));
const port=Number(process.env.PORT||5173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.cu':'text/plain','.cuh':'text/plain','.wasm':'application/wasm'};
http.createServer(async(req,res)=>{
 try{let requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(requestPath.endsWith('/'))requestPath+='index.html';
 const file=path.resolve(root,'.'+requestPath);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(!(await stat(file)).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});res.end(await readFile(file));
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500,{'Content-Type':'text/plain'}).end(e.code==='ENOENT'?'Not found':'Server error');}
}).listen(port,'127.0.0.1',()=>console.log(`RealIsland: http://localhost:${port}\nPress Ctrl+C to stop. WebGPU requires localhost or HTTPS.`));
