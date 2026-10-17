import {copyFileSync,existsSync} from 'node:fs';
const from=new URL('../hyperframes/node_modules/gsap/dist/gsap.min.js', import.meta.url);
const to=new URL('../hyperframes/assets/gsap.min.js', import.meta.url);
if (!existsSync(from)) throw new Error('Please install hyperframes dependencies before preparing the GSAP asset.');
copyFileSync(from,to); console.log('GSAP bundled locally.');
