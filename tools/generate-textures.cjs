// Власний безшовний матеріал: бірюзова глазур і мідна облямівка.
// Генерація без пакетів: node tools/generate-textures.cjs
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const size = 512, tau = 2 * Math.PI;
const fract = x => x - Math.floor(x);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x-a)/(b-a))); return t*t*(3-2*t); };
function field(x, y) {
    const u = fract(x * 4 / size), v = fract(y * 4 / size);
    const edge = Math.min(u, 1-u, v, 1-v);
    const panel = smooth(0.025, 0.12, edge);
    const copper = smooth(0.015, 0.03, edge) * (1-smooth(0.065, 0.085, edge));
    const grain = Math.sin(tau*x*89/size) * Math.cos(tau*y*67/size);
    const engraving = Math.pow(0.5 + 0.5*Math.cos(tau*(u-v)*3), 28) * smooth(0.15, 0.22, edge);
    return { panel, copper, grain, engraving,
        height: 0.72*panel + 0.12*copper - 0.055*engraving + 0.0015*grain*panel };
}
function png(rgb) {
    const chunk = (name, data) => {
        const type = Buffer.from(name), bytes = Buffer.concat([type, data]);
        let crc = 0xffffffff;
        for (const byte of bytes) {
            crc ^= byte;
            for (let bit=0; bit<8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
        }
        const out = Buffer.alloc(data.length+12);
        out.writeUInt32BE(data.length); type.copy(out, 4); data.copy(out, 8);
        out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length-4);
        return out;
    };
    const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4);
    header[8]=8; header[9]=2;
    const scanlines=Buffer.alloc(size*(size*3+1));
    for(let y=0;y<size;y++) rgb.copy(scanlines, y*(size*3+1)+1, y*size*3, (y+1)*size*3);
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',header),
        chunk('IDAT',zlib.deflateSync(scanlines,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
const maps = Object.fromEntries(['diffuse','specular','normal'].map(name => [name,Buffer.alloc(size*size*3)]));
for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const f=field(x,y), offset=(y*size+x)*3;
    const base=[39+12*f.grain, 134+8*f.grain, 151+6*f.grain];
    const copper=[198,132,62];
    for(let c=0;c<3;c++) maps.diffuse[offset+c]=Math.round(
        (19+(base[c]-19)*f.panel)*(1-f.copper) + copper[c]*f.copper - 11*f.engraving);
    const spec=Math.round(22+120*f.panel+100*f.copper-55*f.engraving);
    maps.specular.fill(spec,offset,offset+3);
    // Центральні різниці з циклічним продовженням; +Y відповідає +v.
    const dx=(field(x+1,y).height-field(x-1,y).height)*size*0.018/2;
    const dy=(field(x,y+1).height-field(x,y-1).height)*size*0.018/2;
    const length=Math.hypot(dx,dy,1);
    [-dx/length,-dy/length,1/length].forEach((value,c)=>maps.normal[offset+c]=Math.round((value*.5+.5)*255));
}
const root=path.resolve(__dirname,'..'); fs.mkdirSync(path.join(root,'textures'),{recursive:true});
const embedded={};
for(const [name,bytes] of Object.entries(maps)) {
    const file=png(bytes); fs.writeFileSync(path.join(root,'textures',name+'.png'),file);
    embedded[name]='data:image/png;base64,'+file.toString('base64');
}
// Data URL дозволяють запускати WebGL-текстури через file:// без CORS.
fs.writeFileSync(path.join(root,'TextureData.js'), '// Згенеровано tools/generate-textures.cjs; копії PNG для запуску без сервера.\nconst MATERIAL_TEXTURES = Object.freeze('+JSON.stringify(embedded)+');\n');
console.log('Generated diffuse, specular, normal: 512 × 512, tileable, RGB PNG + offline data URLs.');
