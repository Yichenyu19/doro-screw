import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(process.argv[2]||'dist');
const port=Number(process.argv[3]||4174);
const prefix=`/${(process.argv[4]||'/').replace(/^\/+|\/+$/g,'')}`.replace(/\/?$/,'/');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8'};
createServer(async(req,res)=>{
  try {
    let urlPath=decodeURIComponent(new URL(req.url||'/',`http://127.0.0.1:${port}`).pathname);
    if(!urlPath.startsWith(prefix)){res.writeHead(404);res.end('Not found');return;}
    const relative=urlPath.slice(prefix.length)||'index.html';
    let file=path.resolve(root,relative);
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
    let info=await stat(file).catch(()=>null);
    if(info?.isDirectory()){file=path.join(file,'index.html');info=await stat(file).catch(()=>null);}
    if(!info?.isFile()){res.writeHead(404);res.end('Not found');return;}
    const ext=path.extname(file);
    res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-cache':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
    createReadStream(file).pipe(res);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Doro 发布预览：http://127.0.0.1:${port}${prefix}`));
