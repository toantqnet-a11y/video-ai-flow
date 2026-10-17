import { defineConfig } from 'vite';
// Same-origin proxy means credentials are never sent from an arbitrary website via CORS.
export default defineConfig({server:{host:'127.0.0.1',port:5173,proxy:{'/api':{target:'http://127.0.0.1:4311',changeOrigin:true},'/health':{target:'http://127.0.0.1:4311',changeOrigin:true}}}});
