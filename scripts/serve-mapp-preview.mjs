import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat,copyFile,mkdir,readdir,cp} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=path.resolve(process.argv[2]||'dist-mapp/preview');
const port=Number(process.argv[3]||4190);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.json':'application/json; charset=utf-8','.map':'application/json'};

export async function assemblePreview(web='dist-mapp/web',dest='dist-mapp/preview'){
  const from=path.resolve(web),to=path.resolve(dest);
  await mkdir(to,{recursive:true});
  await cp(from,to,{recursive:true});
  await copyFile('mapp/preview/index.html',path.join(to,'index.html'));
  await copyFile('mapp/preview/mock-sdk.js',path.join(to,'mock-sdk.js'));
  await copyFile('mapp/preview/mock-bar.css',path.join(to,'mock-bar.css'));
  return to;
}

export const MAPP_CSP=[
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' blob:",
  "img-src 'self' blob: data:",
  "font-src 'none'",
  "connect-src 'self' blob: data:",
  "media-src 'self' blob: data:",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types mapp-mock-host",
].join('; ');

export function servePreview(rootDir,portNumber,headers={}){
  const server=createServer(async(req,res)=>{
    try{
      let urlPath=decodeURIComponent(new URL(req.url||'/',`http://127.0.0.1:${portNumber}`).pathname);
      // 预览服务器对浏览器自动请求的图标给 204，避免控制台 404；这些文件不在 app.zip 内。
      if(/^(?:\/favicon\.ico|\/apple-touch-icon.*\.png)$/i.test(urlPath)){res.writeHead(204);res.end();return;}
      let file=path.resolve(rootDir,urlPath==='/'?'index.html':'.'+urlPath);
      if(!file.startsWith(path.resolve(rootDir))){res.writeHead(403);res.end('Forbidden');return;}
      let info=await stat(file).catch(()=>null);
      if(info?.isDirectory()){file=path.join(file,'index.html');info=await stat(file).catch(()=>null);}
      if(!info?.isFile()){res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache',...headers});
      createReadStream(file).pipe(res);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  return new Promise(resolve=>server.listen(portNumber,'127.0.0.1',()=>{
    console.log(`Doro 微应用本地 mock 预览（非官方沙箱）：http://127.0.0.1:${portNumber}/?check=1`);
    resolve(server);
  }));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const dest=await assemblePreview();
  await servePreview(dest,port);
}
