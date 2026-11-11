import test from 'node:test';
import assert from 'node:assert/strict';
import {COLORS} from '../src/types';
import {COLOR_SIGNS,allColorSigns,colorSignClass,colorSignHtml,drawColorSign} from '../src/color-signs';

test('十种钉色各有互不相同的形状记号',()=>{
  const signs=allColorSigns();
  assert.equal(signs.length,COLORS.length);
  assert.equal(new Set(signs.map(item=>item.sign)).size,COLORS.length);
  for(const color of COLORS){
    assert.match(colorSignClass(color),new RegExp(`color-sign-${COLOR_SIGNS[color]}`));
    assert.match(colorSignHtml(color),/aria-hidden="true"/);
  }
});

test('形状记号可以画到画布上且不会空画',()=>{
  const ops:string[]=[];
  const context={
    save(){ops.push('save');},restore(){ops.push('restore');},translate(){},
    beginPath(){ops.push('path');},arc(){ops.push('arc');},fill(){ops.push('fill');},
    stroke(){ops.push('stroke');},fillRect(){ops.push('rect');},moveTo(){},lineTo(){},
    closePath(){},quadraticCurveTo(){},
    strokeStyle:'',fillStyle:'',lineWidth:0,lineCap:'',lineJoin:'',
  } as unknown as CanvasRenderingContext2D;
  for(const color of COLORS)drawColorSign(context,color);
  assert.ok(ops.filter(op=>op==='save').length===COLORS.length);
  assert.ok(ops.some(op=>op==='fill'||op==='stroke'||op==='rect'));
});
